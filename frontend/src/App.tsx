import { Register, AdminUsers } from './api/Admin'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Shell } from './components/Shell'
import { ActionLink, EmptyState } from './components/ui'
import { Catalogue, Enquiry, Home, OfferingDetail } from './pages/Public'
import { Dashboard, ObservationRoute } from './pages/Client'
import { DemoProvider } from './demo/Provider'
import { ReviewQueue, ReviewRoute } from './pages/Moderation'
import { Learning } from './pages/Learning'
import { SessionProvider } from './api/SessionProvider'
import { useSession } from './api/session'
import { Connection } from './api/Connection'
import { ApiBoundary } from './api/Ui'
import { ApiSharedDetail, Themes } from './api/Learning'
import { Improvements } from './api/Improvements'
import { Operations } from './api/Operations'
function NotFound() {
  return <div className="container section"><EmptyState headingLevel={1} title="Page not found" action={<ActionLink to="/">Back to overview</ActionLink>}>Check the address or return to the overview.</EmptyState></div>
}
export function App() {
  return <SessionProvider><DemoProvider><ApplicationRoutes /></DemoProvider></SessionProvider>
}
function ApplicationRoutes() {
  const { scopeKey } = useSession()
  const { pathname } = useLocation()
  return <ApiBoundary key={scopeKey} routeKey={pathname}><Routes><Route element={<Shell />}><Route index element={<Home />} /><Route path="connect" element={<Connection />} /><Route path="register" element={<Register />} /><Route path="admin/users" element={<AdminUsers />} /><Route path="offerings" element={<Catalogue />} /><Route path="offerings/:slug" element={<OfferingDetail />} /><Route path="demo" element={<Enquiry />} /><Route path="learning" element={<Learning />} /><Route path="learning/:id" element={<ApiSharedDetail />} /><Route path="themes" element={<Themes />} /><Route path="improvements" element={<Improvements />} /><Route path="operations" element={<Operations />} /><Route path="workspace" element={<Dashboard />} /><Route path="observations/new" element={<ObservationRoute />} /><Route path="observations/:id" element={<ObservationRoute />} /><Route path="review" element={<ReviewQueue />} /><Route path="review/:id" element={<ReviewRoute />} /><Route path="*" element={<NotFound />} /></Route></Routes></ApiBoundary>
}
