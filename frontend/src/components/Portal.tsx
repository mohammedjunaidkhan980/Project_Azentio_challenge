import { NavLink } from 'react-router-dom'
import { Building2, FlaskConical, LayoutDashboard, Library, ShieldCheck } from 'lucide-react'
import { useDemo } from '../demo/context'
import { personaLabels } from '../demo/workflow'
import type { Persona } from '../demo/workflow'
import type { ReactNode } from 'react'
import { useSession } from '../api/session'
import { ApiPortal } from '../api/Layout'

export function Portal({ children }: { children: ReactNode }) {
  const { persona, setPersona } = useDemo()
  const { mode } = useSession()
  if (mode === 'api') return <ApiPortal>{children}</ApiPortal>
  return <div className="portal-container"><div className="portal-toolbar"><div className="workspace-identity"><span className="workspace-symbol"><Building2 size={20} aria-hidden="true" /></span><div><strong>{persona === 'moderator' ? 'Learning review workspace' : personaLabels[persona].replace('Client · ', '')}</strong><span>Sample data · Preview workspace</span></div></div><label className="persona-select"><span><FlaskConical size={14} aria-hidden="true" />Preview persona — simulated permissions</span><select value={persona} onChange={e => setPersona(e.target.value as Persona)}>{Object.entries(personaLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div><div className="portal-layout"><aside className="portal-sidebar"><p className="eyebrow">COLLABORATION</p><nav aria-label="Workspace"><NavLink end to="/workspace"><LayoutDashboard size={17} aria-hidden="true" />Client dashboard</NavLink><NavLink to="/learning"><Library size={17} aria-hidden="true" />Approved learning</NavLink><NavLink to="/review"><ShieldCheck size={17} aria-hidden="true" />Moderator review</NavLink></nav><div className="sidebar-note"><ShieldCheck size={18} aria-hidden="true" /><strong>Shared by choice.</strong><p>Private drafts and reviewed shared copies have different audiences.</p></div></aside><div className="portal-content">{children}</div></div></div>
}
