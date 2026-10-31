import { useCallback, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Portal } from '../components/Portal'
import { ActionLink, Badge, EmptyState, PageHeading } from '../components/ui'
import { useSession } from './session'
import { ApiError, object, records, text } from './client'
import { services } from './services'
import { useResource } from './useResource'
import { Access, Acknowledgement, ApiForm, Field, Pagination, Resource } from './Ui'
import { value } from './forms'
import { dashboardFor } from './workspaceRoutes'

export function ApiWorkspace() { const { membership } = useSession(); if (membership && membership.role !== 'client') return <Navigate to={dashboardFor(membership.role)} replace />; return <Portal><Access roles={['client']}><OrganisationObservations /></Access></Portal> }
function OrganisationObservations() {
  const { membership } = useSession()
  const [page, setPage] = useState(1)
  const org = membership!.organisation_id
  const resource = useResource(useCallback((signal: AbortSignal) => services.observations(org, page, signal), [org, page]))
  return <><PageHeading eyebrow="CLIENT WORKSPACE" title="Your organisation’s observations." description="Capture and follow observations shared within your organisation." action={<ActionLink to="/observations/new">New observation</ActionLink>} /><div className="api-notice">These records are available to authorised organisation members. Shared learning contains separate copies reviewed for a wider audience.</div><Resource resource={resource}>{data => { const rows = records(data).filter(o => text(o.organisation_id) === org); return rows.length ? <div className="api-records">{rows.map(o => <article className="api-record" key={text(o.id)}><Badge>{text(o.consent_status) || 'not_granted'}</Badge><h2 className="mt-6">{text(o.title)}</h2><p>{text(o.description)}</p><Link className="inline-link" to={`/observations/${encodeURIComponent(text(o.id))}`}>View observation</Link></article>)}</div> : <EmptyState title="No organisation observations">Create an observation using synthetic information only. Saving will not grant shared-learning consent.</EmptyState> }}</Resource><Pagination page={page} setPage={setPage} response={resource.response} /></>
}
export function ApiObservationNew() { return <Portal><Access roles={['client']}><CreateObservation /></Access></Portal> }
function CreateObservation() {
  const { membership } = useSession(), navigate = useNavigate()
  return <><Link className="back-link" to="/workspace">← Organisation observations</Link><PageHeading eyebrow="CLIENT CONTRIBUTION" title="Capture an organisation observation." description="Capture feedback for your organisation. Wider sharing is a separate choice after saving." /><div className="api-notice">This observation will be available to authorised members of your organisation. Only a separately approved copy can be shared more widely.</div><div className="api-narrow"><ApiForm label="Create organisation observation" onSave={async data => { await services.createObservation({ organisation_id: membership!.organisation_id, title: value(data, 'title'), description: value(data, 'description'), ...(value(data, 'product_id') ? { product_id: value(data, 'product_id') } : {}), ...(value(data, 'category') ? { category: value(data, 'category') } : {}) }); navigate('/workspace') }}><Field name="title" label="Title" maxLength={255} /><Field name="description" label="Observation (10–10000 characters)" type="textarea" minLength={10} maxLength={10000} /><Field name="product_id" label="Product ID" required={false} /><Field name="category" label="Category" required={false} maxLength={100} /><Acknowledgement name="organisation_ack">I understand that authorised members of my active organisation can access this observation.</Acknowledgement><p className="disclaimer">Saving does not grant sharing consent. Private drafts, editing and resubmission are not currently available.</p></ApiForm></div></>
}
export function ApiObservationDetail() { return <Portal><Access roles={['client']}><ObservationDetail /></Access></Portal> }
function ObservationDetail() {
  const { id = '' } = useParams(), { membership, user } = useSession()
  const resource = useResource(useCallback((signal: AbortSignal) => services.observation(id, signal), [id]))
  return <><Link className="back-link" to="/workspace">← Organisation observations</Link><PageHeading eyebrow="OBSERVATION" title="Observation and sharing permission" description="The original is restricted to your organisation. Wider sharing requires your consent and moderator approval." /><Resource resource={resource}>{data => {
    const o = object(data)
    if (text(o.organisation_id) !== membership!.organisation_id) throw new ApiError(404, 'SCOPE_MISMATCH', 'This record is not in your active workspace.')
    const granted = o.consent_status === 'granted', owner = text(o.created_by_user_id) === user!.id
    return <><article className="api-record"><Badge tone={granted ? 'amber' : 'neutral'}>Sharing consent: {text(o.consent_status) || 'not_granted'}</Badge><h2 className="mt-6">{text(o.title)}</h2><p>{text(o.description)}</p><p>Status: {text(o.status)}</p></article>{owner ? <ApiForm key={text(o.consent_status)} label={granted ? 'Withdraw sharing consent' : 'Grant sharing consent'} onSave={data => services.consent(id, !granted, value(data, 'reason'))} onDone={resource.reload}><h2>{granted ? 'Withdraw your contribution from shared learning' : 'Explicit sharing permission'}</h2><Field name="reason" label="Reason" required={false} type="textarea" maxLength={2000} /><Acknowledgement name="permission">{granted ? 'I confirm withdrawal of the approved shared copy. Future requests will no longer return it; already viewed copies cannot be recalled.' : 'I explicitly permit this observation to enter moderated, de-identified shared learning. This does not permit attribution or model training.'}</Acknowledgement><p className="disclaimer">Only the author can change sharing consent. This permission covers moderated shared learning; it does not authorise attribution or model training.</p></ApiForm> : <div className="api-notice mt-6">Only the recorded author can change sharing consent.</div>}</>
  }}</Resource></>
}
