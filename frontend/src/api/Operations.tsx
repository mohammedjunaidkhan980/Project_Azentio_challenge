import { useCallback, useEffect, useRef, useState } from 'react'
import { Portal } from '../components/Portal'
import { Badge, EmptyState, PageHeading } from '../components/ui'
import { object, records, text } from './client'
import { services } from './services'
import { useSession } from './session'
import { useResource } from './useResource'
import { Access, Acknowledgement, ApiForm, Field, Pagination, Resource } from './Ui'
import { value } from './forms'
import { ProductManagement } from './ProductManagement'

export function Operations() { return <Portal><Access roles={['admin', 'employee', 'moderator']}><Workspace /></Access></Portal> }
function Workspace() {
  const { membership } = useSession(), [tab, setTab] = useState(membership?.role === 'moderator' ? 'unpublish' : 'enquiries')
  const permissions = useResource(useCallback((signal: AbortSignal) => services.productAccess(signal), []))
  const rights = permissions.response ? object(permissions.response.data) : {}
  const canManage = Object.values(rights).some(v => v === true)
  const tabs = [...(['admin', 'employee'].includes(membership!.role) ? ['enquiries'] : []), ...(['admin', 'moderator'].includes(membership!.role) ? [...(membership!.role === 'moderator' ? ['unpublish'] : []), 'audit'] : []), ...(canManage ? ['products'] : []), ...(membership!.role === 'admin' ? ['entitlements'] : [])]
  return <><PageHeading eyebrow="OPERATIONS" title="Platform operations" description="Review enquiries and manage the platform services available to your membership." /><Resource resource={permissions}>{() => null}</Resource><nav className="api-tabs" aria-label="Operations sections">{tabs.map(t => <button key={t} className={`button ${tab === t ? 'button-primary' : 'button-secondary'}`} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}</nav>{tab === 'enquiries' && <Enquiries />}{tab === 'products' && canManage && <ProductManagement capabilities={rights} />}{tab === 'entitlements' && membership!.role === 'admin' && <ApiForm successMessage="Changes saved." label="Save product entitlement" onSave={data => services.entitlement({ organisation_id: value(data, 'organisation_id'), product_id: value(data, 'product_id'), is_active: value(data, 'is_active') === 'true' })}><h2>Product entitlement</h2><Field name="organisation_id" label="Target organisation UUID" value={membership!.organisation_id} /><Field name="product_id" label="Product UUID" /><Field name="is_active" label="Entitlement state"><option value="true">Active</option><option value="false">Revoked</option></Field><Acknowledgement name="entitlement_ack">I confirm this organisation product-access change.</Acknowledgement></ApiForm>}{tab === 'unpublish' && <ApiForm successMessage="Changes saved." label="Unpublish shared contribution" onSave={data => services.unpublish(value(data, 'entry_id'), value(data, 'reason'))}><h2>Unpublish a shared copy</h2><Field name="entry_id" label="Shared-entry UUID" /><Field name="reason" label="Unpublication reason" type="textarea" maxLength={500} /><Acknowledgement name="unpublish_ack">I confirm removal of this approved copy from shared visibility.</Acknowledgement><p className="disclaimer">No moderator publication-list endpoint is documented. Use an entry ID from an authorised review record.</p></ApiForm>}{tab === 'audit' && <Audit />}</>
}
function Enquiries() {
  const [page, setPage] = useState(1), [selected, setSelected] = useState('')
  const resource = useResource(useCallback((signal: AbortSignal) => services.enquiries(page, signal), [page]))
  return <><h2>Demo enquiries</h2><Resource resource={resource}>{data => { const rows = records(data); return rows.length ? <div className="api-records">{rows.map(e => <article className="api-record" key={text(e.id)}><Badge>{text(e.status)}</Badge><h3>{text(e.organisation_name)}</h3><p>{text(e.product_interest)}</p><button className="button button-secondary" onClick={() => setSelected(text(e.id))}>Open enquiry</button></article>)}</div> : <EmptyState title="No enquiries returned">This page contains no permitted enquiries.</EmptyState> }}</Resource><Pagination page={page} setPage={setPage} response={resource.response} />{selected && <EnquiryDetail key={selected} id={selected} refresh={resource.reload} />}</>
}
function EnquiryDetail({ id, refresh }: { id: string; refresh: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const resource = useResource(useCallback((signal: AbortSignal) => services.enquiry(id, signal), [id]))
  useEffect(() => {
    if (!resource.loading && resource.response) {
      panel.current?.scrollIntoView({ block: 'start' })
      panel.current?.focus({ preventScroll: true })
    }
  }, [resource.loading, resource.response])
  return <Resource resource={resource}>{data => { const e = object(data); return <div className="api-record mt-6" ref={panel} tabIndex={-1} aria-label="Enquiry details"><h2>Enquiry detail</h2><p>{text(e.name)} · {text(e.work_email)}</p><p>{text(e.requirements)}</p><ApiForm successMessage="Changes saved." label="Update enquiry status" onSave={data => services.enquiryStatus(id, value(data, 'status'))} onDone={() => { resource.reload(); refresh() }}><Field name="status" label="Enquiry status" value={text(e.status)}>{['new', 'in_review', 'responded', 'closed'].map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</Field><p className="disclaimer">Changes are saved after the selected status is confirmed.</p></ApiForm></div> }}</Resource>
}
function Audit() {
  const [page, setPage] = useState(1)
  const resource = useResource(useCallback((signal: AbortSignal) => services.audit(page, signal), [page]))
  return <><h2>Audit events</h2><Resource resource={resource}>{data => { const rows = records(data); return rows.length ? <div className="api-records">{rows.map((e, i) => <article className="api-record" key={text(e.id) || i}><h3>{text(e.action) || 'Audit event'}</h3><p>{text(e.occurred_at) || text(e.created_at) || 'Time unavailable'}</p><p className="disclaimer">Recorded administrative and workflow actions. Private source details are excluded from this view.</p></article>)}</div> : <EmptyState title="No audit events returned">No records were returned on this page.</EmptyState> }}</Resource><Pagination page={page} setPage={setPage} response={resource.response} /></>
}
