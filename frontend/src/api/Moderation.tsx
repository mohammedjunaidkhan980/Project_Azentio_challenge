import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Portal } from '../components/Portal'
import { Badge, EmptyState, PageHeading } from '../components/ui'
import { records, text } from './client'
import { services } from './services'
import { useResource } from './useResource'
import { Access, Acknowledgement, ApiForm, Field, Pagination, Resource } from './Ui'
import { value } from './forms'

export function ApiReviewQueue() { return <Portal><Access roles={['moderator']}><Queue /></Access></Portal> }
function Queue() {
  const [page, setPage] = useState(1)
  const resource = useResource(useCallback((signal: AbortSignal) => services.queue(page, signal), [page]))
  return <><PageHeading eyebrow="MODERATION" title="Review proposed contributions." description="Only consent-granted proposals returned by the server belong in this queue. No private-draft lookup is performed." /><Resource resource={resource}>{data => { const rows = records(data); return rows.length ? <div className="api-records">{rows.map(o => <article className="api-record" key={text(o.id)}><Badge tone="amber">Submitted for review</Badge><h2 className="mt-6">{text(o.title)}</h2><p>{text(o.description)}</p><Link className="inline-link" to={`/review/${encodeURIComponent(text(o.id))}`}>Review proposal</Link></article>)}</div> : <EmptyState title="The review queue is clear">No eligible submissions were returned for this page.</EmptyState> }}</Resource><Pagination page={page} setPage={setPage} response={resource.response} /></>
}
export function ApiReviewDetail() { return <Portal><Access roles={['moderator']}><Review /></Access></Portal> }
function Review() {
  const { id = '' } = useParams(), [page, setPage] = useState(1), [approved, setApproved] = useState(false)
  // No moderator-only detail endpoint is documented: obtain originals only from the authorised queue.
  const resource = useResource(useCallback((signal: AbortSignal) => services.queue(page, signal), [page]))
  return <><Link className="back-link" to="/review">← Review queue</Link><PageHeading eyebrow="MODERATION" title="Keep the source separate from what’s shared." description="Record approval with reviewed wording, then explicitly publish. Request-changes/resubmission is not supported by the documented backend." /><Resource resource={resource}>{data => {
    const source = records(data).find(o => text(o.id) === id)
    if (!source && !approved) return <><EmptyState title="Proposal is not on this queue page">It may be reviewed, withdrawn or on a different page. No unrestricted source endpoint is used.</EmptyState><ApiForm label="Publish previously approved copy" onSave={() => services.publish(id)}><h2>Resume an approved publication</h2><Acknowledgement name="resume_ack">I confirm this proposal was approved. The server must revalidate approval and current consent before publication.</Acknowledgement></ApiForm></>
    return <div className="review-layout"><article className="source-panel"><div className="source-header"><h2>Submitted source</h2><Badge>Restricted</Badge></div><div className="source-body"><h3>{text(source?.title)}</h3><p>{text(source?.description)}</p><p className="disclaimer">Only approved redacted fields go to shared learning. Author attribution is unavailable in this API contract.</p></div></article><div>{!approved ? <ApiForm label="Record moderation decision" onSave={async data => { const decision = value(data, 'decision'); if (decision === 'approved' && (!value(data, 'redacted_title') || !value(data, 'redacted_content'))) throw new Error('Reviewed title and body are required for approval.'); const r = await services.decide(id, { decision, reason: value(data, 'reason'), ...(decision === 'approved' ? { redacted_title: value(data, 'redacted_title'), redacted_content: value(data, 'redacted_content') } : {}) }); if (decision === 'approved') setApproved(true); return r }}><h2>Approved-copy editor</h2><Field name="decision" label="Decision" value="approved"><option value="approved">Approve reviewed copy</option><option value="rejected">Reject proposal</option></Field><Field name="reason" label="Decision reason" type="textarea" maxLength={500} /><Field name="redacted_title" label="Reviewed title (required for approval)" required={false} maxLength={255} /><Field name="redacted_content" label="Reviewed body (required for approval)" type="textarea" required={false} minLength={10} maxLength={10000} /><Acknowledgement name="reviewed">I reviewed this decision and removed identifying/confidential information from the approved copy. No attribution or training permission is inferred.</Acknowledgement></ApiForm> : <div className="api-record"><h2>Approval acknowledged.</h2><p>The copy is not published yet. Publishing is a separate API action.</p></div>}<ApiForm label="Publish approved copy" onSave={() => services.publish(id)}><h2>Publication</h2><p className="form-intro">Use this action after a successful approval, including when resuming a previously approved observation. The server must recheck active consent and approval.</p><Acknowledgement name="publish">I confirm publication of the reviewed copy to the entitled shared-learning audience.</Acknowledgement></ApiForm></div></div>
  }}</Resource><Pagination page={page} setPage={setPage} response={resource.response} /></>
}
