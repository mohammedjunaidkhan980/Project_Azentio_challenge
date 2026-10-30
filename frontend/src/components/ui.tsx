import type { ReactNode } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'green' | 'amber' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
export function ActionLink({ to, children, secondary = false }: { to: string; children: ReactNode; secondary?: boolean }) {
  return <Link className={`button ${secondary ? 'button-secondary' : 'button-primary'}`} to={to}>{children}<ArrowRight size={16} aria-hidden="true" /></Link>
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  const Icon = error ? AlertCircle : CheckCircle2
  return <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'}><Icon size={20} aria-hidden="true" /><div>{children}</div></div>
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lede">{description}</p></div>{action}</div>
}
export function EmptyState({ title, children, action, headingLevel = 2 }: { title: string; children: ReactNode; action?: ReactNode; headingLevel?: 1 | 2 }) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return <div className="empty-state"><span className="empty-mark" aria-hidden="true">—</span><Heading>{title}</Heading><p>{children}</p>{action}</div>
}
