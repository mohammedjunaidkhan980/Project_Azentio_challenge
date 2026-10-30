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
  return <article className="learning-card"><Badge tone="green">Server-returned shared copy</Badge><h2 className="mt-6">{title}</h2><p>{body}</p>{!detail && <Link className="inline-link" to={`/learning/${encodeURIComponent(text(data.id))}`}>View approved contribution</Link>}</article>
}
export function ApiLearning() { return <Portal><Access roles={['client']}><Feed /></Access></Portal> }
function Feed() {
  const [page, setPage] = useState(1)
  const resource = useResource(useCallback((signal: AbortSignal) => services.learning(page, '', signal), [page]))
  return <><PageHeading eyebrow="APPROVED LEARNING · API" title="Reviewed learning for your permitted audience." description="Server publication, consent and product-entitlement checks are required. No private source fallback or client training is used." /><Resource resource={resource}>{data => { const rows = records(data); return rows.length ? <div className="learning-grid">{rows.map(o => <SafeCopy key={text(o.id)} data={o} />)}</div> : <EmptyState title="No approved learning available">There may be no publications, or your organisation may lack the relevant product entitlement.</EmptyState> }}</Resource><Pagination page={page} setPage={setPage} response={resource.response} /></>
}
export function ApiSharedDetail() { return <Portal><Access roles={['client']}><SharedDetail /></Access></Portal> }
function SharedDetail() {
  const { id = '' } = useParams()
  const resource = useResource(useCallback((signal: AbortSignal) => services.shared(id, signal), [id]))
  return <><Link className="back-link" to="/learning">← Approved learning</Link><PageHeading eyebrow="APPROVED COPY · API" title="Shared contribution" description="Availability is rechecked by the server for this request. Withdrawn evidence must not be returned." /><Resource resource={resource}>{data => <SafeCopy data={object(data)} detail />}</Resource></>
}
