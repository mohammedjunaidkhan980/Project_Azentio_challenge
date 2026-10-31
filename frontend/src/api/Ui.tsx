import { Component, useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Notice } from '../components/ui'
import { useSession } from './session'
import type { Envelope } from './client'
export function Access({ roles, children }: { roles?: string[]; children: ReactNode }) {
  const { user, membership } = useSession()
  if (!user) return <EmptyState headingLevel={1} title="Sign in to your API workspace" action={<Link className="button button-primary" to="/connect">Sign in</Link>}>No preview persona or local role grants API access.</EmptyState>
  if (!membership) return <EmptyState headingLevel={1} title="Choose an active organisation">Select one of your active memberships above before continuing.</EmptyState>
  if (roles && !roles.includes(membership.role)) return <EmptyState headingLevel={1} title="Access denied">This active membership does not have a documented role for this action. Server checks remain authoritative.</EmptyState>
  return children
}
export function Resource({ resource, children }: { resource: { loading: boolean; error: string; response: Envelope<unknown> | null; reload: () => void }; children: (data: unknown) => ReactNode }) {
  if (resource.loading) return <div role="status" aria-busy="true" className="loading-panel">Loading from the configured API…</div>
  if (resource.error) return <><Notice error>{resource.error}</Notice><button className="button button-secondary mt-4" onClick={resource.reload}>Retry request</button></>
  return resource.response ? children(resource.response.data) : null
}
export function Pagination({ page, response, setPage }: { page: number; response: Envelope<unknown> | null; setPage: (page: number) => void }) {
  const max = response?.meta?.total_pages
  return <div className="api-pagination"><button className="button button-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous page</button><span>Page {page}{typeof max === 'number' ? ` of ${Math.max(1, max)}` : ''}</span><button className="button button-secondary" disabled={typeof max !== 'number' || page >= max} onClick={() => setPage(page + 1)}>Next page</button></div>
}
export function Field({ name, label, type = 'text', required = true, maxLength, minLength, value, children }: { name: string; label: string; type?: string; required?: boolean; maxLength?: number; minLength?: number; value?: string; children?: ReactNode }) {
  const identifier = useId()
  return <div className="field"><label htmlFor={identifier}>{label}{!required && <span> (optional)</span>}</label>{children ? <select id={identifier} name={name} required={required} defaultValue={value}>{children}</select> : type === 'textarea' ? <textarea id={identifier} name={name} required={required} minLength={minLength} maxLength={maxLength} defaultValue={value} rows={4} /> : <input id={identifier} name={name} type={type} required={required} maxLength={maxLength} minLength={minLength} defaultValue={value} autoComplete={type === 'password' ? 'current-password' : 'off'} />}</div>
}
export function ApiForm({ children, label, onSave, onDone }: { children: ReactNode; label: string; onSave: (values: FormData) => Promise<unknown>; onDone?: () => void }) {
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (pending) return
    const data = new FormData(e.currentTarget)
    setPending(true); setError(''); setSuccess(false)
    try { await onSave(data); setSuccess(true); onDone?.() }
    catch (e) { setError((e as Error).message) }
    finally { setPending(false) }
  }
  return <form className="form-panel api-form" onSubmit={submit}>{children}{error && <Notice error>{error}</Notice>}{success && <Notice>The API acknowledged this action. Refresh the relevant view to see its current state.</Notice>}<button type="submit" className="button button-primary mt-6" disabled={pending}>{pending ? 'Sending request…' : label}</button></form>
}
export function Acknowledgement({ name, children }: { name: string; children: ReactNode }) { return <label className="checkbox-label"><input type="checkbox" name={name} required />{children}</label> }
export class ApiBoundary extends Component<{ children: ReactNode; routeKey?: string }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: Error) { return { error: error.message || 'The response could not be displayed safely.' } }
  componentDidUpdate(previous: { routeKey?: string }) { if (previous.routeKey !== this.props.routeKey && this.state.error) this.setState({ error: '' }) }
  render() { return this.state.error ? <div className="container section"><EmptyState headingLevel={1} title="API contract needs attention" action={<Link className="button button-secondary" to="/connect">Connection & profile</Link>}>{this.state.error} No private source fallback was used.</EmptyState></div> : this.props.children }
}
