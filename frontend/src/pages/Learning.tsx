import { useSession } from '../api/session'
import { ApiLearning } from '../api/Learning'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Search, ShieldCheck } from 'lucide-react'
import { Portal } from '../components/Portal'
import { Badge, EmptyState, PageHeading } from '../components/ui'
import { useDemo } from '../demo/context'

export function Learning() { const { mode } = useSession(); return mode === 'api' ? <ApiLearning /> : <DemoLearning /> }
function DemoLearning() {
  const { workflow } = useDemo()
  const [query, setQuery] = useState('')
  const filtered = workflow.shared.filter(s => `${s.title} ${s.body}`.toLowerCase().includes(query.toLowerCase()))
  return <Portal><PageHeading eyebrow="APPROVED COLLECTIVE LEARNING" title="Browse reviewed contributions." description="Read approved copies; private originals and reviewer notes are excluded." /><div className="learning-disclosure"><ShieldCheck size={18} aria-hidden="true" /><span>Simulated approved community · Synthetic evidence · No model training</span></div><label className="search-field learning-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Search approved learning</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search reviewed observations" /></label><p className="results-count" role="status">{filtered.length} reviewed {filtered.length === 1 ? 'contribution' : 'contributions'}</p>{!filtered.length ? <EmptyState title={query ? 'No matching reviewed contributions' : 'Shared learning starts with a reviewed contribution'} action={<Link to="/review" className="button button-secondary">Explore moderator preview</Link>}>{query ? 'Try another search. Private source text is never searched here.' : 'Propose a synthetic observation, then use the moderator preview to approve a separate safe copy. Drafts never appear automatically.'}</EmptyState> : <div className="learning-grid">{filtered.map(s => <article className="learning-card" key={s.id}><div className="learning-card-top"><Badge tone="green">Reviewed community copy</Badge><BookOpen size={18} aria-hidden="true" /></div><h2>{s.title}</h2><p className="whitespace-pre-wrap">{s.body}</p><div className="learning-evidence"><span>Evidence: {s.evidence_type}</span><span>Confidence: {s.confidence}</span></div><p className="learning-limitation">{s.limitations}</p><div className="learning-card-footer"><span>{s.attribution ?? 'De-identified · No attribution'}</span><span>Financial Analysis Intelligence</span></div></article>)}</div>}<p className="disclaimer">Shared copy visibility updates immediately in this in-memory preview. This does not verify backend withdrawal propagation or tenant isolation.</p></Portal>
}
