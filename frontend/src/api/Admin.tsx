import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Notice } from '../components/ui'
import { useSession } from './session'
import { Portal } from '../components/Portal'
import { PageHeading } from '../components/ui'
import { api, object, pageQuery, records, text } from './client'
import { Access, Acknowledgement, ApiForm, Field, Pagination, Resource } from './Ui'
import { useResource } from './useResource'
import { value } from './forms'

export function Register() {
  return <div className="container section api-narrow"><PageHeading eyebrow="ACCOUNT REGISTRATION" title="Register a test account" description="Registration does not verify email or grant membership. An approved identity and administrator assignment are still required." /><ApiForm label="Register account" onSave={data => api.request('/auth/register', { auth: false, method: 'POST', body: { full_name: value(data, 'full_name'), email: value(data, 'email'), password: String(data.get('password') ?? '') } })}><Field name="full_name" label="Full name" /><Field name="email" label="Email address" type="email" /><Field name="password" label="New password" type="password" minLength={8} maxLength={128} /><p className="disclaimer">No role, organisation, active or verified flags are sent. Passwords are never persisted by this frontend.</p></ApiForm></div>
}
export function AdminUsers() { return <Portal><Access roles={['admin']}><Users /></Access></Portal> }
function Users() {
  const [page, setPage] = useState(1)
  const resource = useResource(useCallback((signal: AbortSignal) => api.request('/admin/users' + pageQuery(page), { signal }), [page]))
  return <><PageHeading eyebrow="ADMINISTRATION" title="Users and memberships" description="Manage user access and organisation memberships. Access changes are recorded for review." /><Resource resource={resource}>{data => <div className="api-records">{records(data).map(u => <article className="api-record" key={text(u.id)}><h2>{text(u.full_name)}</h2><p>{text(u.email)} · {u.is_active === true ? 'Active' : 'Inactive'} · {u.is_verified === true ? 'Verified' : 'Unverified'}</p><Link className="button button-secondary" to={`/admin/users/${encodeURIComponent(text(u.id))}`}>Manage user</Link></article>)}</div>}</Resource><Pagination page={page} setPage={setPage} response={resource.response} /></>
}
export function AdminUserDetail() {
  const { id = '' } = useParams()
  return <Portal><Access roles={['admin']}><Manage id={id} /></Access></Portal>
}
const roles = ['client', 'moderator', 'product_owner', 'employee', 'admin']
const capabilities = ['create', 'edit', 'publish', 'unpublish']
function Manage({ id }: { id: string }) {
  const path = `/admin/users/${encodeURIComponent(id)}`
  const { user: actor } = useSession()
  const [notice, setNotice] = useState('')
  const resource = useResource(useCallback((signal: AbortSignal) => api.request(path, { signal }), [path]))
  const organisations = useResource(useCallback((signal: AbortSignal) => api.request('/admin/organisations', { signal }), []))
  function saved() { setNotice('Changes saved.'); resource.reload() }
  return <><Link className="back-link" to="/admin/users">← Back to users</Link>{notice && <Notice>{notice}</Notice>}<Resource resource={resource}>{data => {
    const u = object(data), memberships = records(u.memberships)
    const self = actor?.id === text(u.id)
    return <><PageHeading eyebrow="USER MANAGEMENT" title={text(u.full_name)} description={text(u.email)} /><div className="hero-actions"><Badge tone={u.is_active === true ? 'green' : 'neutral'}>{u.is_active === true ? 'Active account' : 'Inactive account'}</Badge><Badge>{u.is_verified === true ? 'Email verified' : 'Awaiting verification'}</Badge></div>
      <h2 className="mt-6">Organisation memberships</h2><div className="api-records">{memberships.map(m => <section className="api-record" aria-label={`Membership at ${text(m.organisation_name)}`} key={text(m.id)}><h3>{text(m.organisation_name)}</h3><p>{text(m.role).replaceAll('_', ' ')} · {m.is_active === true ? 'Active' : 'Revoked'}</p>
      {self && m.role === 'admin' ? <p>Your current administrator membership is protected from removal.</p> : <><ApiForm successMessage="Changes saved." label="Save membership" onDone={saved} onSave={d => api.request(path + '/memberships/' + encodeURIComponent(text(m.id)), { method: 'PATCH', body: { role: value(d, 'role'), is_active: value(d, 'active') === 'true' } })}><Field name="role" label="Membership role" value={text(m.role)}>{roles.map(r => <option key={r} value={r}>{r.replaceAll('_', ' ')}</option>)}</Field><Field name="active" label="Membership state" value={m.is_active === true ? 'true' : 'false'}><option value="true">Active</option><option value="false">Inactive</option></Field><Acknowledgement name="confirm">I confirm this organisation role and access change.</Acknowledgement></ApiForm>{m.is_active === true && <ApiForm successMessage="Changes saved." label="Revoke membership" onDone={saved} onSave={() => api.request(path + '/memberships/' + encodeURIComponent(text(m.id)), { method: 'DELETE' })}><Acknowledgement name="revoke">Revoke access to this organisation. The membership history will be retained.</Acknowledgement></ApiForm>}</>}
      </section>)}</div>
      <Resource resource={organisations}>{orgData => <ApiForm successMessage="Changes saved." label="Assign membership" onDone={saved} onSave={d => api.request(path + '/memberships', { method: 'POST', body: { organisation_id: value(d, 'organisation_id'), role: value(d, 'role') } })}><h2>Add an organisation membership</h2><Field name="organisation_id" label="Organisation"><option value="">Select an organisation</option>{records(orgData).map(o => <option key={text(o.id)} value={text(o.id)}>{text(o.name)}</option>)}</Field><Field name="role" label="Role">{roles.map(r => <option key={r} value={r}>{r.replaceAll('_', ' ')}</option>)}</Field><Acknowledgement name="confirm">I confirm this role assignment. Existing account approval is still required.</Acknowledgement></ApiForm>}</Resource>
      {self ? <p className="mt-6">Your own administrator account cannot be deactivated here.</p> : <ApiForm successMessage="Changes saved." label="Save account status" onDone={saved} onSave={d => api.request(path + '/status', { method: 'PATCH', body: { is_active: value(d, 'active') === 'true' } })}><h2>Account status</h2><Field name="active" label="Account status" value={u.is_active === true ? 'true' : 'false'}><option value="true">Active</option><option value="false">Inactive</option></Field><Acknowledgement name="status">I confirm this account status change. Deactivation prevents new authenticated requests.</Acknowledgement></ApiForm>}
      <ProductAccess user={u} path={path} /><Link className="button button-secondary mt-6" to="/admin/users">Cancel and return to users</Link>
    </>
  }}</Resource></>
}
function ProductAccess({ user, path }: { user: Record<string, unknown>; path: string }) {
  const memberships = records(user.memberships)
  const [notice, setNotice] = useState('')
  const access = useResource(useCallback((signal: AbortSignal) => api.request(path + '/product-access', { signal }), [path]))
  const products = useResource(useCallback((signal: AbortSignal) => api.request('/products/managed?page_size=100', { signal }), []))
  function saved() { setNotice('Access changes saved.'); access.reload() }
  const eligible = memberships.filter(m => m.is_active === true && ['employee', 'admin'].includes(text(m.role)))
  return <><h2 className="mt-6">Product access and catalogue permissions</h2>{notice && <Notice>{notice}</Notice>}<Resource resource={access}>{data => {
    const a = object(data)
    return <><h3>Organisation product access</h3><p>Product access belongs to the organisation and applies to its authorised members. An inactive account or revoked membership does not gain access.</p><ul>{records(a.entitlements).map((e, n) => <li key={n}>{text(memberships.find(m => m.organisation_id === e.organisation_id)?.organisation_name)} · {text(e.product_name)} · {e.is_active === true ? 'Enabled' : 'Disabled'}</li>)}</ul>
      <Resource resource={products}>{productData => <ApiForm successMessage="Changes saved." label="Save product access" onDone={saved} onSave={d => api.request('/entitlements/product', { method: 'POST', body: { organisation_id: value(d, 'organisation_id'), product_id: value(d, 'product_id'), is_active: value(d, 'active') === 'true' } })}><Field name="organisation_id" label="Product access organisation"><option value="">Select an organisation</option>{memberships.filter(m => m.is_active === true).map(m => <option key={text(m.id)} value={text(m.organisation_id)}>{text(m.organisation_name)}</option>)}</Field><Field name="product_id" label="Product"><option value="">Select a product</option>{records(productData).map(p => <option key={text(p.id)} value={text(p.id)}>{text(p.name)}{p.is_published !== true ? ' (Draft)' : ''}</option>)}</Field><Field name="active" label="Product access state"><option value="true">Enabled</option><option value="false">Disabled</option></Field><Acknowledgement name="access_ack">I confirm this product-access change affects all authorised members of the selected organisation.</Acknowledgement></ApiForm>}</Resource>
      <h3 className="mt-6">Catalogue action grants</h3><p>Administrators can create and edit drafts. Publishing and unpublishing require explicit grants. Employee catalogue actions require individual grants. Grants apply only while the account and eligible membership remain active and verified.</p><ul>{records(a.grants).map(g => <li key={text(g.id)}>{text(memberships.find(m => m.id === g.membership_id)?.organisation_name)} · {text(g.permission).replace('products.', '')} · {g.is_active === true ? 'Granted' : 'Revoked'}{g.is_active === true && <ApiForm successMessage="Changes saved." label={`Revoke ${text(g.permission).replace('products.', '')} permission`} onDone={saved} onSave={() => api.request(path + '/permissions', { method: 'POST', body: { membership_id: g.membership_id, permission: g.permission, is_active: false } })}><Acknowledgement name="revoke_grant">I confirm removal of this explicit catalogue grant.</Acknowledgement></ApiForm>}</li>)}</ul>
      {eligible.length && user.is_active === true && user.is_verified === true ? <ApiForm successMessage="Changes saved." label="Save catalogue permission" onDone={saved} onSave={d => api.request(path + '/permissions', { method: 'POST', body: { membership_id: value(d, 'membership_id'), permission: value(d, 'permission'), is_active: value(d, 'active') === 'true' } })}><Field name="membership_id" label="Permission membership">{eligible.map(m => <option key={text(m.id)} value={text(m.id)}>{text(m.organisation_name)} · {text(m.role)}</option>)}</Field><Field name="permission" label="Catalogue action">{capabilities.map(c => <option key={c} value={'products.' + c}>{c === 'create' ? 'Create drafts' : c === 'edit' ? 'Edit offerings' : c === 'publish' ? 'Publish offerings' : 'Unpublish offerings'}</option>)}</Field><Field name="active" label="Permission state"><option value="true">Granted</option><option value="false">Revoked</option></Field><Acknowledgement name="permission_ack">I confirm this explicit catalogue permission change. Publishing is separate from product creation and editing.</Acknowledgement></ApiForm> : <p>Catalogue permissions require an active, verified employee or administrator membership.</p>}
    </>
  }}</Resource></>
}
