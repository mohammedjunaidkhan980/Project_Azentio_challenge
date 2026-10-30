import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowRight, ChartNoAxesCombined, Check, CheckCheck, FileText, LockKeyhole, MessageSquareText, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { ActionLink, Badge, EmptyState, Notice, PageHeading } from '../components/ui'
import { demoCatalogue, offerings } from '../demo/catalogue'
import type { DemoEnquiry, Offering, PreviewCondition } from '../demo/catalogue'
import { useSession } from '../api/session'
import { ApiCatalogue, ApiProduct, ApiEnquiry } from '../api/Public'

const icons = { chart: ChartNoAxesCombined, file: FileText, shield: ShieldCheck }
export function OfferingCard({ offering }: { offering: Offering }) {
  const Icon = icons[offering.icon]
  return <article className="offering-card"><div className="card-top"><span className="offering-icon"><Icon size={23} strokeWidth={1.6} aria-hidden="true" /></span><Badge>{offering.category}</Badge></div><h3>{offering.name}</h3><p>{offering.description}</p><Link to={`/offerings/${offering.slug}`} className="card-link">Explore offering <ArrowRight size={17} aria-hidden="true" /><span className="sr-only">: {offering.name}</span></Link></article>
}

export function Home() {
  const { mode } = useSession()
  return <>
    <section className="hero"><div className="container hero-grid"><div className="hero-copy"><p className="eyebrow"><span className="eyebrow-line" />BANKING · FINANCIAL SERVICES · ENTERPRISE</p><h1>Enterprise AI for<br /><span>financial services.</span></h1><p>{mode === 'demo' ? 'Explore sample scenarios for financial analysis, document review and risk workflows. See how client observations can move through explicit sharing choices and human review.' : 'Explore published AI offerings and see how client observations can move through explicit sharing choices and human review.'}</p><div className="hero-actions"><ActionLink to="/offerings">Explore AI offerings</ActionLink><ActionLink secondary to="/workspace">Preview client workflow</ActionLink></div><p className="hero-caption"><ShieldCheck size={16} aria-hidden="true" />Sharing is explicit. Review comes first.</p></div>
    <div className="journey-illustration" aria-label="Illustration of the governed collaboration workflow"><div className="journey-topline"><span className="small-dot" />THE LEARNING LOOP<span className="journey-version">01 — 04</span></div><div className="journey-card"><div className="journey-icon"><MessageSquareText size={20} aria-hidden="true" /></div><div><span className="step-label">01 / CLIENT OBSERVATION</span><h3>A signal worth understanding.</h3><p>“Seasonal cash flow needs more context.”</p><span className="illustration-label"><LockKeyhole size={12} aria-hidden="true" /> Private draft · Synthetic example</span></div></div><div className="journey-connector"><span /><ArrowDown size={14} aria-hidden="true" /><span /></div><div className="journey-review"><ShieldCheck size={20} aria-hidden="true" /><div><strong>Explicit choice. Human review.</strong><span>Reviewed wording before community sharing</span></div><Check size={16} aria-hidden="true" /></div><div className="journey-connector"><span /><ArrowDown size={14} aria-hidden="true" /><span /></div><div className="journey-result"><div className="result-icon"><ChartNoAxesCombined size={22} aria-hidden="true" /></div><div><span className="step-label">03 — 04 / SHARED LEARNING → IMPROVEMENT</span><h3>Evidence-linked product improvement.</h3><span className="illustration-label">Linked insight · Human-owned decision</span></div></div><p className="illustration-footnote">Workflow illustration · No automated model training</p></div>
    </div></section>
    <div className="principles-strip"><div className="container"><span>COLLABORATION PRINCIPLES</span><p><LockKeyhole size={16} aria-hidden="true" />Explicit sharing choices</p><p><ShieldCheck size={16} aria-hidden="true" />Human review before sharing</p><p><CheckCheck size={16} aria-hidden="true" />Separate approved copies</p></div></div>
    <section className="container section" aria-labelledby="offerings-heading"><div className="section-heading"><div><p className="eyebrow">{mode === 'demo' ? 'SAMPLE OFFERINGS' : 'OFFERINGS'}</p><h2 id="offerings-heading">{mode === 'demo' ? 'Explore representative workflows.' : 'Explore AI offerings.'}</h2></div><Link to="/offerings" className="inline-link">View all offerings <ArrowRight size={16} aria-hidden="true" /></Link></div>{mode === 'demo' ? <><p className="section-note">Sample catalogue. Descriptions are illustrative and do not represent released product capabilities.</p><div className="offering-grid">{offerings.map(o => <OfferingCard key={o.id} offering={o} />)}</div></> : <ActionLink to="/offerings">Browse offerings</ActionLink>}</section>
    <section className="container collaboration-section"><div><p className="eyebrow">CLIENT COLLABORATION</p><h2>Share observations by choice.</h2><p>Keep the original private. Authors choose whether to propose a separate copy; a moderator reviews it before approved sharing.</p></div><ActionLink to="/workspace">Preview the client workflow</ActionLink></section>
  </>
}

export function Catalogue() { const { mode } = useSession(); return mode === 'api' ? <ApiCatalogue /> : <DemoCatalogue /> }
function DemoCatalogue() {
  const [condition, setCondition] = useState<PreviewCondition>('ready')
  const [result, setResult] = useState<{ items: Offering[]; loading: boolean; error: string }>({ items: [], loading: true, error: '' })
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All offerings')
  useEffect(() => {
    let current = true
    demoCatalogue.list(condition).then(items => { if (current) setResult({ items, loading: false, error: '' }) }).catch((e: Error) => { if (current) setResult({ items: [], loading: false, error: e.message }) })
    return () => { current = false }
  }, [condition, attempt])
  function changeCondition(value: PreviewCondition) { setResult({ items: [], loading: true, error: '' }); setCondition(value) }
  function retry() { setResult({ items: [], loading: true, error: '' }); setCondition('ready'); setAttempt(attempt + 1) }
  const filtered = result.items.filter(o => (category === 'All offerings' || o.category === category) && `${o.name} ${o.description}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="container section"><PageHeading eyebrow="AI OFFERINGS" title="Find the right starting point." description="Explore focused AI capabilities and the work they can support. Every example here uses synthetic data." /><div className="catalogue-toolbar"><label className="search-field"><Search size={18} aria-hidden="true" /><span className="sr-only">Search offerings</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search offerings or use cases" /></label><label className="select-field"><span className="sr-only">Offering category</span><SlidersHorizontal size={16} aria-hidden="true" /><select value={category} onChange={e => setCategory(e.target.value)}>{['All offerings', 'Lending', 'Operations', 'Risk & compliance'].map(c => <option key={c}>{c}</option>)}</select></label></div><div className="results-heading"><p role="status">{result.loading ? 'Loading offerings…' : `${filtered.length} illustrative offering${filtered.length === 1 ? '' : 's'}`}</p><label className="preview-condition">Preview data <select aria-label="Catalogue preview data" value={condition} onChange={e => changeCondition(e.target.value as PreviewCondition)}><option value="ready">Available</option><option value="empty">Empty state</option><option value="error">Load failure</option></select></label></div>
    {result.loading ? <div className="loading-panel" aria-busy="true">Loading the synthetic catalogue…</div> : result.error ? <><Notice error>{result.error}</Notice><button className="button button-secondary mt-4" onClick={retry}>Retry catalogue</button></> : filtered.length ? <div className="offering-grid">{filtered.map(o => <OfferingCard key={o.id} offering={o} />)}</div> : <EmptyState title="No offerings found">Try another search or category. The catalogue is illustrative and contains no live client data.</EmptyState>}
    <p className="disclaimer">Sample catalogue. Descriptions are illustrative and do not represent released product capabilities or guaranteed business outcomes.</p></div>
}

export function OfferingDetail() { const { mode } = useSession(); return mode === 'api' ? <ApiProduct /> : <DemoOfferingDetail /> }
function DemoOfferingDetail() {
  const { slug } = useParams()
  const offering = offerings.find(o => o.slug === slug)
  if (!offering) return <div className="container section"><EmptyState headingLevel={1} title="Offering not found" action={<ActionLink to="/offerings">Back to offerings</ActionLink>}>This offering is not in the illustrative catalogue.</EmptyState></div>
  const Icon = icons[offering.icon]
  return <div className="container section"><Link className="back-link" to="/offerings">← All offerings</Link><div className="detail-layout"><div><Badge tone="blue">{offering.category} · Sample scenario</Badge><h1 className="mt-6">{offering.name}</h1><p className="lede">{offering.description}</p><h2 className="mt-10">A clearer view of the evidence.</h2><p className="body-copy">{offering.benefit} This sample scenario illustrates a possible workflow. It does not make a credit, risk or business decision.</p><h3 className="mt-8">Explore these use cases</h3><ul className="check-list">{offering.use_cases.map(c => <li key={c}><Check size={17} aria-hidden="true" />{c}</li>)}</ul><ActionLink to={`/demo?offering=${offering.id}`}>Request a demo</ActionLink></div><aside className="detail-aside"><span className="large-icon"><Icon size={48} strokeWidth={1.3} aria-hidden="true" /></span><p className="eyebrow">A GUIDED STARTING POINT</p><h2>Explore. Reflect.<br />Contribute.</h2><p>In the client workspace, a synthetic scenario leads to an observation — and an explicit choice about who can see it.</p><ActionLink secondary to="/workspace">Preview client workspace</ActionLink><p className="disclaimer">Demo workflow only. No live product integration.</p></aside></div></div>
}

export function Enquiry() { const { mode } = useSession(); return mode === 'api' ? <ApiEnquiry /> : <DemoEnquiryForm /> }
function DemoEnquiryForm() {
  const [search] = useSearchParams()
  const [values, setValues] = useState<DemoEnquiry>({ offering_id: offerings.some(o => o.id === search.get('offering')) ? search.get('offering')! : offerings[0].id, name: '', email: '', organisation_name: '', message: '', processing_acknowledgement: false })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [fail, setFail] = useState(false)
  const [failure, setFailure] = useState('')
  const [receipt, setReceipt] = useState('')
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const invalid: Record<string, string> = {}
    if (!values.name.trim()) invalid.name = 'Enter your name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) invalid.email = 'Enter a valid email address.'
    if (!values.organisation_name.trim()) invalid.organisation_name = 'Enter your organisation name.'
    if (!values.processing_acknowledgement) invalid.processing_acknowledgement = 'Acknowledge the demo processing notice to continue.'
    setErrors(invalid); setFailure('')
    if (Object.keys(invalid).length) { document.getElementById(Object.keys(invalid)[0])?.focus(); return }
    setPending(true)
    try { const r = await demoCatalogue.enquire(values, fail); setReceipt(`${r.id} — ${r.acknowledgement}`) }
    catch (error) { setFailure((error as Error).message) }
    finally { setPending(false) }
  }
  return <div className="container section"><Link className="back-link" to="/offerings">← All offerings</Link><div className="enquiry-layout"><div><p className="eyebrow">START A CONVERSATION</p><h1>Let’s explore<br />what’s possible.</h1><p className="lede">Tell us what you’re interested in. This preview shows how a demo enquiry would work.</p><div className="enquiry-note"><ShieldCheck size={24} aria-hidden="true" /><h3>Your details stay in this preview.</h3><p>Use fictional details only. No information is sent to a server or email provider. Refreshing clears the preview.</p></div></div><div className="form-panel">{receipt ? <div className="success-panel"><span className="success-icon"><CheckCheck size={28} aria-hidden="true" /></span><h2>Preview enquiry recorded.</h2><Notice>{receipt}</Notice><p>This is not a live demo booking.</p><ActionLink to="/workspace">Explore the portal preview</ActionLink></div> : <form onSubmit={submit} noValidate><h2>Request a demo</h2><p className="form-intro">All fields required except your message. Synthetic details only.</p><div className="field"><label htmlFor="offering_id">Offering</label><select id="offering_id" value={values.offering_id} onChange={e => setValues({ ...values, offering_id: e.target.value })}>{offerings.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div><div className="form-grid">{(['name', 'email', 'organisation_name'] as const).map(key => <div className={`field ${key === 'organisation_name' ? 'full-width' : ''}`} key={key}><label htmlFor={key}>{key === 'name' ? 'Your name' : key === 'email' ? 'Email address' : 'Organisation'}</label><input id={key} type={key === 'email' ? 'email' : 'text'} autoComplete="off" maxLength={255} required value={values[key]} placeholder={key === 'name' ? 'e.g. Alex Morgan' : key === 'email' ? 'e.g. alex@example.com' : 'e.g. Fictional Bank A'} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} onChange={e => setValues({ ...values, [key]: e.target.value })} />{errors[key] && <span id={`${key}-error`} className="field-error">{errors[key]}</span>}</div>)}</div><div className="field"><label htmlFor="message">What would you like to explore? <span>(optional)</span></label><textarea id="message" rows={3} maxLength={2000} value={values.message} onChange={e => setValues({ ...values, message: e.target.value })} placeholder="Describe a synthetic use case. Do not include confidential information." /></div><label className="checkbox-label"><input id="processing_acknowledgement" type="checkbox" checked={values.processing_acknowledgement} aria-invalid={!!errors.processing_acknowledgement} aria-describedby={errors.processing_acknowledgement ? 'consent-error' : undefined} onChange={e => setValues({ ...values, processing_acknowledgement: e.target.checked })} /><span>I understand that this is a synthetic preview and my entries are used only for this demo interaction.</span></label>{errors.processing_acknowledgement && <p id="consent-error" className="field-error">{errors.processing_acknowledgement}</p>}{failure && <Notice error>{failure}</Notice>}<button disabled={pending} className="button button-primary w-full mt-6" type="submit">{pending ? 'Recording preview…' : 'Record demo enquiry'}<ArrowRight size={16} aria-hidden="true" /></button><details className="preview-options"><summary>Demo testing options</summary><label className="checkbox-label"><input type="checkbox" checked={fail} onChange={e => setFail(e.target.checked)} />Simulate a request failure</label></details></form>}</div></div></div>
}
