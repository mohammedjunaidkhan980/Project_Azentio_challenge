import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Portal } from '../components/Portal'
import { Badge, EmptyState, PageHeading } from '../components/ui'
import { ApiError, object, records, text } from './client'
import { services } from './services'
import { useResource } from './useResource'
import { Access, Pagination, Resource } from './Ui'

function SafeCopy({ data, detail = false }: { data: Record<string, unknown>; detail?: boolean }) {
  // Verified SharedLearningOut exposes only approved title/content fields;
  // never fall back to original title/description, nested observation, tenant IDs or notes.
  const title = text(data.title), body = text(data.content)
  if (!title || !body) throw new ApiError(0, 'SHARED_SCHEMA_UNCONFIRMED', 'The shared-learning response needs approved title/content fields before it can be displayed safely.')
  return <article className="learning-card"><Badge tone="green">Approved shared copy</Badge><h2 className="mt-6">{title}</h2><p>{body}</p>{!detail && <Link className="inline-link" to={`/learning/${encodeURIComponent(text(data.id))}`}>View approved contribution</Link>}</article>
}
export function ApiLearning() { return <Portal><Access roles={['client', 'product_owner']}><Feed /></Access></Portal> }
function Feed() {
  const [page, setPage] = useState(1), [query, setQuery] = useState('')
  const resource = useResource(useCallback((signal: AbortSignal) => services.learning(page, '', signal, query), [page, query]))
  return <><PageHeading eyebrow="APPROVED LEARNING" title="Reviewed learning for your permitted audience." description="Explore reviewed contributions shared with organisations entitled to the relevant products. Private originals are not included." /><Link className="inline-link" to="/themes">Explore approved themes</Link><form className="catalogue-toolbar" role="search" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(String(new FormData(event.currentTarget).get('q') ?? '').trim()) }}><label htmlFor="learning-search">Search approved learning</label><input id="learning-search" name="q" type="search" maxLength={200} /><button className="button button-secondary" type="submit">Search</button></form><Resource resource={resource}>{data => { const rows = records(data); return rows.length ? <div className="learning-grid">{rows.map(o => <SafeCopy key={text(o.id)} data={o} />)}</div> : <EmptyState title="No approved learning available">There may be no publications, or your organisation may lack the relevant product entitlement.</EmptyState> }}</Resource><Pagination page={page} setPage={setPage} response={resource.response} /></>
}
export function ApiSharedDetail() { return <Portal><Access roles={['client', 'product_owner']}><SharedDetail /></Access></Portal> }
function SharedDetail() {
  const { id = '' } = useParams()
  const resource = useResource(useCallback((signal: AbortSignal) => services.shared(id, signal), [id]))
  return <><Link className="back-link" to="/learning">← Approved learning</Link><PageHeading eyebrow="APPROVED COPY" title="Shared contribution" description="This reviewed contribution is available only while its sharing permission and your access remain active." /><Resource resource={resource}>{data => <SafeCopy data={object(data)} detail />}</Resource></>
}

export function Themes() { return <Portal><Access roles={['client', 'product_owner']}><ThemeList /></Access></Portal> }
function ThemeList() {
  const resource = useResource(useCallback((signal: AbortSignal) => services.themes(signal), []))
  return <><PageHeading eyebrow="COLLECTIVE LEARNING" title="Evidence behind emerging themes." description="Themes group reviewed contributions for your permitted products. Small cohorts are suppressed; a theme is an observation, not a market prediction." /><Resource resource={resource}>{data => {
    const rows = records(data)
    return rows.length ? <div className="api-records">{rows.map(theme => <article className="api-record" key={text(theme.id)}><h2>{text(theme.title)}</h2><p>{String(theme.distinct_organisations)} contributing organisations</p><p>{text(theme.limitations)}</p><p>Offering reference: {text(theme.product_id) || 'General learning'}</p><p>Publication window: {text(theme.publication_window_start).slice(0, 10)} – {text(theme.publication_window_end).slice(0, 10)}. This is not the source observation period.</p><p>Updated: {text(theme.updated_at).slice(0, 10)}</p><ul>{records(theme.supporting_contributions).map(entry => <li key={text(entry.id)}><Link className="inline-link" to={`/learning/${encodeURIComponent(text(entry.id))}`}>{text(entry.title)}</Link></li>)}</ul></article>)}</div> : <EmptyState title="No themes meet the privacy threshold">More independently contributed, approved evidence may be needed. Small-cohort counts are not disclosed.</EmptyState>
  }}</Resource></>
}
