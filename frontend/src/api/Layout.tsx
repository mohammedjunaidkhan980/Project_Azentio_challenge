import { Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Building2 } from 'lucide-react'
import { useSession } from './session'
import { dashboardFor, signInPath } from './workspaceRoutes'
export function ApiPortal({ children }: { children: ReactNode }) {
  const { user, membership, setOrganisation, logout } = useSession()
  const location = useLocation(), navigate = useNavigate()
  if (!user || !membership) return <Navigate to={signInPath(location)} replace />
  const role = membership.role
  return <div className="portal-container"><div className="portal-toolbar"><div className="workspace-identity"><Building2 size={22} aria-hidden="true" /><div><strong>{membership.organisation_name || 'Your organisation'}</strong><span>{user.full_name}</span></div></div><div className="api-account"><label className="persona-select">Active organisation<select aria-label="Active organisation" value={membership.organisation_id} onChange={e => { const next = user.memberships.find(m => m.organisation_id === e.target.value); if (next) { setOrganisation(next.organisation_id); navigate(dashboardFor(next.role)) } }}>{user.memberships.map(m => <option key={m.organisation_id} value={m.organisation_id}>{m.organisation_name} · {m.role.replaceAll('_', ' ')}</option>)}</select></label><button className="button button-secondary" onClick={logout}>Sign out</button></div></div><div className="portal-layout"><aside className="portal-sidebar"><p className="eyebrow">WORKSPACE</p><nav aria-label="Workspace">
    {role === 'employee' && <NavLink to="/employee">Employee dashboard</NavLink>}
    {role === 'client' && <><NavLink to="/workspace" end>Client dashboard</NavLink><NavLink to="/learning">Approved learning</NavLink></>}
    {role === 'moderator' && <NavLink to="/review">Moderator review</NavLink>}
    {['client', 'product_owner'].includes(role) && <NavLink to="/themes">Learning themes</NavLink>}
    {['client', 'product_owner'].includes(role) && <NavLink to="/improvements">Product improvements</NavLink>}
    {['admin', 'employee', 'moderator'].includes(role) && <NavLink to="/operations">Operations</NavLink>}
    {role === 'admin' && <NavLink to="/admin/users">User administration</NavLink>}
    <NavLink to="/account">Account</NavLink></nav><div className="sidebar-note"><strong>Your organisation’s workspace</strong><p>Only services available to your active membership are shown.</p></div></aside><div className="portal-content">{children}</div></div></div>
}
