import { useSession } from '../api/session'
import { ApiReviewQueue, ApiReviewDetail } from '../api/Moderation'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Check, FileCheck2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Portal } from '../components/Portal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ActionLink, Badge, EmptyState, Notice, PageHeading } from '../components/ui'
import { AccessDenied } from './Client'
import { useDemo } from '../demo/context'
import { personaLabels, reviewObservation, reviewQueue } from '../demo/workflow'

export function ReviewQueue() { const { mode } = useSession(); return mode === 'api' ? <ApiReviewQueue /> : <DemoReviewQueue /> }
function DemoReviewQueue() {
  const { persona, workflow } = useDemo()
  const location = useLocation()
  const notice = (location.state as { notice?: string } | null)?.notice
  const queue = reviewQueue(workflow)
  return <Portal>{persona !== 'moderator' ? <AccessDenied /> : <><PageHeading eyebrow="LEARNING MODERATION" title="Review proposed contributions." description="Review submitted proposals and remove identifying details before approving a separate community copy." />{notice && <div className="mb-6"><Notice>{notice}</Notice></div>}<div className="review-policy"><ShieldCheck size={22} aria-hidden="true" /><div><strong>Review the context. Publish only what’s safe.</strong><p>Remove identifying details, specific locations and confidential information. Permission to share does not make the original safe to publish.</p></div></div><div className="panel-heading queue-heading"><h2>Proposed contributions</h2><Badge tone="amber">{queue.length} awaiting review</Badge></div>{!queue.length ? <EmptyState title="The review queue is clear" action={<ActionLink to="/learning">View approved learning</ActionLink>}>No submitted contributions currently need review. Private drafts are never included here.</EmptyState> : <div className="review-queue">{queue.map(o => <Link key={o.id} to={`/review/${o.id}`} className="queue-row"><span className="queue-icon"><FileCheck2 size={23} aria-hidden="true" /></span><div><div className="queue-meta"><Badge tone="amber">Pending review</Badge><span>Submitted revision {o.version} · Synthetic evidence</span></div><h3>{o.title}</h3><p>Publication permission recorded · Attribution {o.attribution_consent ? 'permitted, review required' : 'not permitted'}</p></div><ArrowRight size={18} aria-hidden="true" /></Link>)}</div>}</>}</Portal>
}

export function ReviewRoute() { const { mode } = useSession(); return mode === 'api' ? <ApiReviewDetail /> : <DemoReviewRoute /> }
function DemoReviewRoute() {
  const { persona } = useDemo()
  const { id } = useParams()
  return <ReviewDetail key={`${persona}:${id}`} />
}
function ReviewDetail() {
  const { id } = useParams()
  const { persona, workflow, setWorkflow } = useDemo()
  const source = reviewQueue(workflow).find(o => o.id === id)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [reason, setReason] = useState('')
  const [attribution, setAttribution] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const navigate = useNavigate()
  if (persona !== 'moderator') return <Portal><AccessDenied /></Portal>
  if (!source) return <Portal><EmptyState headingLevel={1} title="Proposal no longer available" action={<ActionLink to="/review">Back to review queue</ActionLink>}>It may have been withdrawn or already reviewed. Unsubmitted private drafts cannot be opened here.</EmptyState></Portal>
  function decision(action: 'return' | 'reject' | 'publish') {
    if (!source) return
    try {
      const next = reviewObservation(workflow, persona, { id: source.id, expected_version: source.version, action, reason, approved_title: title, approved_body: body, include_attribution: attribution })
      setWorkflow(next)
      navigate('/review', { state: { notice: action === 'publish' ? 'Reviewed copy published in this synthetic preview. The private original was not shared.' : action === 'return' ? 'Changes requested. The contributor can amend and propose a new revision.' : 'Proposal rejected in this preview. No shared copy was created.' } })
    } catch (err) { setConfirm(false); setError((err as Error).message) }
  }
  function publishPreview() {
    setError('')
    if (!title.trim() || !body.trim() || !reason.trim() || !reviewed) { setError('Complete the reviewed title, body and reason, and confirm the privacy review before publishing.'); return }
    setConfirm(true)
  }
  return <Portal><Link className="back-link" to="/review">← Review queue</Link><PageHeading eyebrow="REVIEW A CONTRIBUTION" title="Separate the source from what’s shared." description="The original is restricted. Only the fields in the approved-copy preview will appear in shared learning." /><div className="review-layout"><section className="source-panel" aria-labelledby="source-title"><div className="source-header"><LockKeyhole size={17} aria-hidden="true" /><h2 id="source-title">Submitted source</h2><Badge>Restricted</Badge></div><div className="source-body"><p className="eyebrow">{personaLabels[source.author].replace('Client · ', '')} · SYNTHETIC</p><h3>{source.title}</h3><p className="whitespace-pre-wrap">{source.body}</p><dl className="metadata-list"><div><dt>Evidence</dt><dd>{source.evidence_type}</dd></div><div><dt>Period</dt><dd>{source.period}</dd></div><div><dt>Confidence</dt><dd>{source.confidence}</dd></div></dl><div className="source-consent"><Check size={16} aria-hidden="true" /><span>Publication permission recorded for this submitted revision.</span></div><p className="disclaimer">Author and organisation details shown here must not be copied into community content without separate permission and review.</p></div></section>
    <section className="safe-copy-panel" aria-labelledby="safe-title"><div className="source-header"><ShieldCheck size={17} aria-hidden="true" /><h2 id="safe-title">Approved-copy editor</h2><Badge tone="blue">Community</Badge></div><div className="source-body"><p className="form-intro">Write a separate safe representation. Source metadata and notes are excluded.</p><button type="button" className="button button-secondary example-button" onClick={() => { setTitle('More context for seasonal cash-flow comparisons'); setBody('A synthetic seasonal cash-flow comparison could benefit from clearer context. Reviewers suggested an explanation of seasonal effects alongside the comparison.'); setReviewed(false) }}>Use synthetic safe-copy example</button><div className="field"><label htmlFor="approved-title">Reviewed title</label><input id="approved-title" maxLength={160} value={title} onChange={e => { setTitle(e.target.value); setReviewed(false) }} /></div><div className="field"><label htmlFor="approved-body">Reviewed body</label><textarea id="approved-body" rows={6} maxLength={10000} value={body} onChange={e => { setBody(e.target.value); setReviewed(false) }} placeholder="Remove organisation names, specific locations and identifying details." /></div><div className="field"><label htmlFor="review-reason">Reason / feedback to contributor</label><textarea id="review-reason" rows={3} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain the decision or request a clarification." /></div><label className="checkbox-label"><input type="checkbox" checked={attribution} disabled={!source.attribution_consent} onChange={e => { setAttribution(e.target.checked); setReviewed(false) }} /><span>{source.attribution_consent ? 'Include fictional organisation attribution after review.' : 'No attribution — author did not opt in.'}</span></label><label className="checkbox-label"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /><span>I reviewed the proposed copy for identifying and confidential information, and confirmed that sharing stays within the author’s permission.</span></label>{error && <Notice error>{error}</Notice>}<div className="review-actions"><button className="button button-secondary" onClick={() => decision('return')}>Request changes</button><button className="button button-danger" onClick={() => decision('reject')}>Reject proposal</button><button className="button button-primary" onClick={publishPreview}>Preview publication <ArrowRight size={16} aria-hidden="true" /></button></div><p className="disclaimer">Demo decision only. No live review notification or database write occurs.</p></div></section></div>
    <ConfirmDialog open={confirm} title="Publish this reviewed copy?" confirmLabel="Publish reviewed copy" onCancel={() => setConfirm(false)} onConfirm={() => decision('publish')}><Badge tone="green">Approved learning community · Preview only</Badge><h3 className="mt-6">{title}</h3><p className="whitespace-pre-wrap">{body}</p><dl className="metadata-list"><div><dt>Evidence type</dt><dd>{source.evidence_type}</dd></div><div><dt>Confidence</dt><dd>{source.confidence}</dd></div></dl><p className="disclaimer">Attribution: {attribution ? personaLabels[source.author].replace('Client · ', '') : 'None — de-identified'}. Private source metadata and reviewer notes are excluded. No model training is enabled.</p></ConfirmDialog>
  </Portal>
}
