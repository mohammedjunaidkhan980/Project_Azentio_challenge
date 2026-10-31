import { useSession } from '../api/session'
import { ApiWorkspace, ApiObservationNew, ApiObservationDetail } from '../api/Observations'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, FileText, LockKeyhole, Plus, ShieldCheck } from 'lucide-react'
import { Portal } from '../components/Portal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ActionLink, Badge, EmptyState, Notice, PageHeading } from '../components/ui'
import { useDemo } from '../demo/context'
import { blankObservation, ownObservations, saveObservation, withdrawObservation } from '../demo/workflow'
import type { ObservationInput, ObservationState } from '../demo/workflow'

const stateLabels: Record<ObservationState, string> = { DRAFT: 'Private draft', SUBMITTED: 'Pending review', RETURNED: 'Changes requested', REJECTED: 'Not approved', PUBLISHED: 'Published safe copy', WITHDRAWN: 'Withdrawn' }
export function StatusBadge({ state }: { state: ObservationState }) { return <Badge tone={state === 'PUBLISHED' ? 'green' : ['SUBMITTED', 'RETURNED'].includes(state) ? 'amber' : 'neutral'}>{stateLabels[state]}</Badge> }
export function AccessDenied() { return <EmptyState headingLevel={1} title="This preview persona cannot open this page" action={<ActionLink to="/workspace">Back to workspace</ActionLink>}>Use the labelled preview selector to explore the appropriate role. This simulates navigation only; real permissions require server enforcement.</EmptyState> }

export function Dashboard() { const { mode } = useSession(); return mode === 'api' ? <ApiWorkspace /> : <DemoDashboard /> }
function DemoDashboard() {
  const { persona, workflow } = useDemo()
  const [condition, setCondition] = useState('ready')
  const observations = ownObservations(workflow, persona)
  return <Portal>{persona === 'moderator' ? <><PageHeading eyebrow="ROLE PREVIEW" title="You’re previewing a moderator." description="Client records are not listed in this view. Open the review workspace to inspect proposed contributions." /><ActionLink to="/review">Open moderator review</ActionLink></> : <>
    <PageHeading eyebrow="CLIENT WORKSPACE" title="Observations and review status." description="Review your observations, see what is awaiting moderation, and browse approved learning." action={<ActionLink to="/observations/new"><Plus size={16} aria-hidden="true" />New observation</ActionLink>} />
    <div className="workspace-summary"><div><span>YOUR OBSERVATIONS</span><strong>{observations.length.toString().padStart(2, '0')}</strong><p>In this preview persona</p></div><div><span>AWAITING REVIEW</span><strong>{observations.filter(o => o.state === 'SUBMITTED').length.toString().padStart(2, '0')}</strong><p>Explicitly proposed for sharing</p></div><div><span>APPROVED LEARNING</span><strong>{workflow.shared.length.toString().padStart(2, '0')}</strong><p>Reviewed copies in the demo feed</p></div></div>
    <div className="workspace-columns"><section className="observations-panel" aria-labelledby="observations-heading"><div className="panel-heading"><h2 id="observations-heading">My observations</h2><label className="preview-condition"><span className="sr-only">Observation preview data</span><select aria-label="Observation preview data" value={condition} onChange={e => setCondition(e.target.value)}><option value="ready">Available</option><option value="empty">Empty state</option><option value="error">Load failure</option></select></label></div>{condition === 'error' ? <div className="panel-padding"><Notice error>The simulated observation request failed. Your data has not changed.</Notice><button className="button button-secondary mt-4" onClick={() => setCondition('ready')}>Retry observations</button></div> : condition === 'empty' || !observations.length ? <EmptyState title="Start with an observation" action={<ActionLink to="/observations/new">Create private draft</ActionLink>}>Capture a synthetic product gap or useful practice. Saving starts privately.</EmptyState> : <div className="observation-list">{observations.map(o => <Link key={o.id} to={`/observations/${o.id}`} className="observation-row"><div className="observation-row-top"><span className="record-type"><FileText size={13} aria-hidden="true" />FINANCIAL ANALYSIS</span><StatusBadge state={o.state} /></div><h3>{o.title}</h3><p>{o.body}</p><div className="observation-row-bottom"><span><LockKeyhole size={12} aria-hidden="true" />{o.visibility === 'author' ? 'Original: author-restricted' : 'Original: organisation-restricted'}</span><span>View observation <ArrowRight size={14} aria-hidden="true" /></span></div></Link>)}</div>}</section><aside className="workspace-aside"><div className="mini-offering"><span className="eyebrow">YOUR DEMO OFFERING</span><Badge tone="blue">Synthetic scenario</Badge><h3>Financial Analysis Intelligence</h3><p>Explore the workflow behind a seasonal cash-flow observation.</p><Link to="/offerings/financial-analysis" className="inline-link">View demo outline <ArrowRight size={15} aria-hidden="true" /></Link></div><div className="privacy-note"><ShieldCheck size={22} aria-hidden="true" /><h3>Private is the starting point.</h3><p>Sharing with the community requires your explicit permission and moderator review. No model is trained on this preview.</p><Link className="text-link" to="/learning">Browse approved learning</Link></div></aside></div>
  </>}</Portal>
}

export function ObservationRoute() { const { mode } = useSession(); const { id } = useParams(); return mode === 'api' ? (id ? <ApiObservationDetail /> : <ApiObservationNew />) : <DemoObservationRoute /> }
function DemoObservationRoute() {
  const { id } = useParams()
  const { persona } = useDemo()
  return <ObservationForm key={`${persona}:${id ?? 'new'}`} />
}
function ObservationForm() {
  const { id } = useParams()
  const { persona, workflow, setWorkflow } = useDemo()
  const existing = id ? ownObservations(workflow, persona).find(o => o.id === id) : undefined
  const [input, setInput] = useState<ObservationInput>(existing ?? blankObservation)
  const [audience, setAudience] = useState<'author' | 'organisation' | 'community'>(existing?.visibility ?? 'author')
  const [processing, setProcessing] = useState(false)
  const [publication, setPublication] = useState(false)
  const [attribution, setAttribution] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState('')
  const [withdraw, setWithdraw] = useState(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  function updateInput(next: ObservationInput) { setInput(next); setPublication(false); setAttribution(false) }
  const location = useLocation()
  const saved = (location.state as { notice?: string } | null)?.notice
  const navigate = useNavigate()
  if (persona === 'moderator' || (id && !existing)) return <Portal><AccessDenied /></Portal>
  const editable = !existing || ['DRAFT', 'RETURNED'].includes(existing.state)
  function confirmWithdrawal() {
    if (!existing) return
    try {
      setWorkflow(withdrawObservation(workflow, persona, existing.id, existing.version))
      setWithdraw(false)
      navigate(`/observations/${existing.id}`, { replace: true, state: { notice: 'Sharing withdrawn in this preview. The shared copy is removed; your private original is retained.' } })
    } catch (err) { setWithdraw(false); setFailure((err as Error).message) }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const action = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const submit = action?.value === 'submit'
    const invalid: Record<string, string> = {}
    if (!input.title.trim()) invalid.title = 'Enter an observation title.'
    if (!input.body.trim()) invalid.body = 'Describe your synthetic observation.'
    if (!processing) invalid.processing = 'Acknowledge processing for this preview.'
    if (submit && !publication) invalid.publication = 'Give explicit permission before proposing community sharing.'
    setErrors(invalid); setFailure('')
    if (Object.keys(invalid).length) { document.getElementById(Object.keys(invalid)[0])?.focus(); return }
    setPending(true)
    await new Promise(resolve => setTimeout(resolve, 180))
    if (!active.current) return
    try {
      const next = saveObservation(workflow, persona, { id: existing?.id, expected_version: existing?.version, input, visibility: audience === 'organisation' ? 'organisation' : 'author', processing_consent: processing, submit, publication_consent: publication, attribution_consent: attribution })
      setWorkflow(next)
      setPublication(false); setAttribution(false); setProcessing(false)
      const item = next.observations.find(o => o.id === existing?.id) ?? next.observations[0]
      const notice = submit ? 'Proposed for community sharing in this preview. It is pending review, not published.' : 'Draft saved in this preview. No shared copy was created.'
      navigate(`/observations/${item.id}`, { replace: true, state: { notice } })
    } catch (err) { setFailure((err as Error).message) }
    finally { if (active.current) setPending(false) }
  }
  return <Portal><Link to="/workspace" className="back-link">← My observations</Link><PageHeading eyebrow="CLIENT CONTRIBUTION" title={existing ? 'Your observation' : 'Start with what you’ve noticed.'} description="Use synthetic information only. Keep customer identities, accounts, credentials and confidential terms out of your contribution." />{saved && <div className="mb-6"><Notice>{saved}</Notice></div>}{existing?.feedback && <div className="review-feedback"><strong>Reviewer feedback</strong><p>{existing.feedback}</p></div>}{existing && <div className="record-meta"><StatusBadge state={existing.state} /><span>Revision {existing.version} · Original: {existing.visibility === 'author' ? 'author-restricted' : 'organisation-restricted'}; assigned reviewers may see submitted revisions</span></div>}
    {!editable ? <div className="read-only-observation"><h2>{existing!.title}</h2><p className="whitespace-pre-wrap">{existing!.body}</p><dl className="metadata-list"><div><dt>Evidence</dt><dd>{existing!.evidence_type}</dd></div><div><dt>Observation period</dt><dd>{existing!.period}</dd></div><div><dt>Confidence</dt><dd>{existing!.confidence}</dd></div></dl><p className="disclaimer">Submitted revisions cannot be edited in place. Returned observations can be amended and proposed again with renewed permission.</p></div> : <form className="observation-form" onSubmit={save} noValidate><div className="form-panel"><h2>Observation details</h2><p className="form-intro">Title, description and processing acknowledgement are required. All content is synthetic.</p><div className="field"><label htmlFor="title">Title</label><input id="title" maxLength={160} required value={input.title} onChange={e => updateInput({ ...input, title: e.target.value })} aria-invalid={!!errors.title} aria-describedby={errors.title ? 'title-error' : undefined} placeholder="e.g. More context for seasonal cash flow" />{errors.title && <span id="title-error" className="field-error">{errors.title}</span>}</div><div className="field"><label htmlFor="body">What did you observe?</label><textarea id="body" required maxLength={10000} rows={5} value={input.body} onChange={e => updateInput({ ...input, body: e.target.value })} aria-invalid={!!errors.body} aria-describedby={errors.body ? 'body-error' : 'body-help'} placeholder="Describe the synthetic scenario, what happened and what would help." /><span id="body-help" className="field-help">Describe a pattern, not individual customers or transactions.</span>{errors.body && <span id="body-error" className="field-error">{errors.body}</span>}</div><div className="form-grid">{([{ key: 'offering_id', label: 'Offering', options: [['financial-analysis', 'Financial Analysis Intelligence']] }, { key: 'period', label: 'Observation period', options: [['2026-Q3', 'Jul–Sep 2026'], ['2026-Q4', 'Oct–Dec 2026']] }, { key: 'industry', label: 'Industry', options: [['Banking', 'Banking'], ['Lending', 'Lending']] }, { key: 'region', label: 'Region', options: [['Broad / unspecified', 'Broad / unspecified'], ['South Asia', 'South Asia']] }, { key: 'evidence_type', label: 'Evidence type', options: [['Synthetic sandbox', 'Synthetic sandbox'], ['Synthetic example', 'Synthetic example']] }, { key: 'confidence', label: 'Confidence', options: [['Limited', 'Limited — small synthetic sample'], ['Exploratory', 'Exploratory — needs more evidence']] }] as const).map(field => <div className="field" key={field.key}><label htmlFor={field.key}>{field.label}</label><select id={field.key} value={input[field.key]} onChange={e => updateInput({ ...input, [field.key]: e.target.value })}>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>)}</div></div>
    <div className="form-panel sharing-panel"><h2>Who should be able to see it?</h2><p className="form-intro">Your original and a reviewed shared copy have separate audiences.</p><fieldset className="audience-options"><legend className="sr-only">Sharing choice</legend>{([{ value: 'author', label: 'Only me', text: 'Keep the draft private to this preview author.' }, { value: 'organisation', label: 'My organisation', text: 'An explicit choice to show the original within your fictional organisation.' }, { value: 'community', label: 'Propose community sharing', text: 'A moderator reviews a separate, de-identified copy before it appears in shared learning.' }] as const).map(a => <label key={a.value} className={`audience-option ${audience === a.value ? 'selected' : ''}`}><input type="radio" name="audience" value={a.value} checked={audience === a.value} onChange={() => { setAudience(a.value); setPublication(false); setAttribution(false) }} /><span><strong>{a.label}</strong><span>{a.text}</span></span></label>)}</fieldset><label className="checkbox-label"><input id="processing" type="checkbox" checked={processing} onChange={e => setProcessing(e.target.checked)} aria-invalid={!!errors.processing} aria-describedby={errors.processing ? 'processing-error' : undefined} /><span>I allow this synthetic observation to be processed within this preview. No external service receives it.</span></label>{errors.processing && <p id="processing-error" className="field-error">{errors.processing}</p>}{audience === 'community' && <div className="publication-consent"><label className="checkbox-label"><input id="publication" type="checkbox" checked={publication} onChange={e => setPublication(e.target.checked)} aria-invalid={!!errors.publication} aria-describedby={errors.publication ? 'publication-error' : undefined} /><span>I explicitly permit a reviewed, de-identified copy to be shared with the approved learning community.</span></label>{errors.publication && <p id="publication-error" className="field-error">{errors.publication}</p>}<label className="checkbox-label"><input type="checkbox" checked={attribution} onChange={e => setAttribution(e.target.checked)} /><span>Optional: permit fictional organisation attribution, subject to review.</span></label></div>}<div className="training-note"><LockKeyhole size={15} aria-hidden="true" />Model training permission is separate and is not requested or enabled.</div>{failure && <Notice error>{failure}</Notice>}<div className="form-actions"><button className="button button-secondary" type="submit" value="draft" disabled={pending}>{pending ? 'Saving…' : 'Save draft'}</button>{audience === 'community' && <button className="button button-primary" type="submit" value="submit" disabled={pending}>Propose for review <ArrowRight size={16} aria-hidden="true" /></button>}</div><p className="disclaimer">Save draft never publishes. Changes exist only in memory and reset on refresh.</p></div></form>}
    {existing && ['SUBMITTED', 'PUBLISHED'].includes(existing.state) && <div className="withdraw-section"><div><h3>You remain in control of sharing.</h3><p>Withdraw the proposal or its shared copy. The original stays private; previously viewed material cannot be recalled.</p></div><button className="button button-danger" onClick={() => setWithdraw(true)}>Withdraw sharing</button></div>}
    <ConfirmDialog open={withdraw} title="Withdraw this contribution?" confirmLabel="Confirm withdrawal" destructive onCancel={() => setWithdraw(false)} onConfirm={confirmWithdrawal}><p>This removes the proposal from review and any approved copy from the demo feed and search. Your original is retained. Previously viewed or copied material cannot be recalled automatically.</p></ConfirmDialog>
  </Portal>
}
