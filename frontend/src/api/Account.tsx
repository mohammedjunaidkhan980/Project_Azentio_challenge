import { Link } from 'react-router-dom'
import { Portal } from '../components/Portal'
import { EmptyState, PageHeading } from '../components/ui'
import { useSession } from './session'
import { Access } from './Ui'
import { dashboardFor } from './workspaceRoutes'

export function Account() {
  const { user, membership } = useSession()
  return <Portal><Access><PageHeading eyebrow="YOUR ACCOUNT" title="Your profile and workspace." description="Your organisation controls access to its workspaces and services." /><section className="form-panel api-narrow"><h2>Signed-in profile</h2><p>{user?.full_name}</p><p>{user?.email}</p><Link className="button button-primary mt-4" to={dashboardFor(membership?.role ?? '')}>Open workspace</Link></section></Access></Portal>
}

export function EmployeeWorkspace() {
  return <Portal><Access roles={['employee']}><PageHeading eyebrow="EMPLOYEE WORKSPACE" title="Your employee workspace." description="Access operational work available to your organisation membership." /><section className="form-panel"><h2>Operational work</h2><p>Review demo enquiries and manage their progress.</p><Link className="button button-primary mt-4" to="/operations">Open operational work</Link></section><EmptyState title="No additional resources assigned">Internal learning, experiments and product playgrounds are not available in this workspace yet.</EmptyState></Access></Portal>
}
