import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ApiError } from './client'
import { useSession } from './session'
import { destinationFor } from './workspaceRoutes'
import { Notice } from '../components/ui'

export function Connection() {
  const { mode, setMode, user, membership, setOrganisation, sessionNotice, login, logout } = useSession()
  const [search] = useSearchParams()
  const [selected, setSelected] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (mode !== 'api') setMode('api') }, [mode, setMode])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try { await login(String(data.get('email')).trim(), String(data.get('password'))) }
    catch (cause) {
      const failure = cause instanceof ApiError ? cause : null
      setError(failure?.status === 401 ? 'The email or password is incorrect. Please try again.'
        : failure?.status === 403 ? 'Your account needs approval or access to this workspace. Please contact your administrator.'
        : failure?.status === 422 ? 'Check your email address and password, then try again.'
        : 'Sign-in is temporarily unavailable. Please try again shortly.')
    } finally { setPending(false) }
  }

  if (user && membership) return <Navigate to={destinationFor(membership, search.get('returnTo'))} replace />

  return <div className="container login-page"><section className="login-card" aria-labelledby="login-title">
    <p className="eyebrow">AZENTIO.AI</p>
    <h1 id="login-title">{user ? 'Choose your workspace' : 'Welcome back'}</h1>
    <p className="login-intro">{user ? user.memberships.length ? 'Choose an organisation to continue.' : 'Your account does not currently have workspace access.' : "Sign in to access your organisation's workspace."}</p>
    {sessionNotice && <Notice>{sessionNotice}</Notice>}
    {user ? <div className="login-profile">
      {user.memberships.length ? <form aria-label="Choose workspace" onSubmit={event => { event.preventDefault(); if (user.memberships.some(m => m.organisation_id === selected)) setOrganisation(selected) }}><label htmlFor="workspace-choice">Organisation and role</label><select id="workspace-choice" value={selected} onChange={event => setSelected(event.target.value)} required><option value="" disabled>Select your workspace</option>{user.memberships.map(m => <option key={m.organisation_id} value={m.organisation_id}>{m.organisation_name} · {m.role.replaceAll('_', ' ')}</option>)}</select><button className="button button-primary" disabled={!selected}>Continue to workspace</button></form> : <div role="alert"><h2>Workspace access required</h2><p>You do not have an active organisation membership. Contact your administrator to request access.</p></div>}
      <button className="button button-secondary" onClick={logout}>Sign out</button>
    </div> : <form onSubmit={submit} aria-label="Sign in" aria-busy={pending}>
      <div className="field"><label htmlFor="login-email">Work email</label><input id="login-email" name="email" type="email" autoComplete="username" required maxLength={255} /></div>
      <div className="field"><label htmlFor="login-password">Password</label><div className="login-password"><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required /><button className="button button-secondary" type="button" aria-controls="login-password" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide password' : 'Show password'}</button></div></div>
      {error && <Notice error>{error}</Notice>}
      <button className="button button-primary login-submit" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      <p className="login-register">New to Azentio.ai? <Link to="/register">Create an account</Link></p>
    </form>}
  </section></div>
}
