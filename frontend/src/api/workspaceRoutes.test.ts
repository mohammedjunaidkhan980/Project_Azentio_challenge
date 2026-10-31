import { expect, it } from 'vitest'
import { dashboardFor, destinationFor, safeReturnPath } from './workspaceRoutes'

it.each(['https://outside.example', '//outside.example', '/\\outside.example', '/%2f%2foutside', '/%5coutside', '/connect', '/admin/users%0a', '/missing'])('rejects unsafe or unsupported return paths: %s', path => {
  expect(safeReturnPath(path)).toBeNull()
})
it('preserves permitted deep links but never sends a client into an admin workspace', () => {
  const client = { organisation_id: 'a', organisation_name: 'A', is_active: true, role: 'client' }
  expect(destinationFor(client, '/observations/abc?view=history#status')).toBe('/observations/abc?view=history#status')
  expect(destinationFor(client, '/admin/users')).toBe('/workspace')
  expect(destinationFor({ ...client, role: 'moderator' }, '/workspace')).toBe('/review')
  expect(dashboardFor('employee')).toBe('/employee')
  expect(dashboardFor('product_owner')).toBe('/improvements')
})
