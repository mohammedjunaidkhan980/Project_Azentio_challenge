import type { Membership } from './session'

export function dashboardFor(role: string): string {
  return ({ admin: '/admin/users', employee: '/employee', client: '/workspace', moderator: '/review', product_owner: '/improvements' } as Record<string, string>)[role] || '/connect'
}

export function safeReturnPath(value: string | null): string | null {
  if (!value || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) return null
  try {
    if (Array.from(decodeURIComponent(value)).some(char => char === '\\' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null
    const url = new URL(value, 'https://workspace.invalid')
    if (url.origin !== 'https://workspace.invalid') return null
    const allowed = /^\/(?:workspace|employee|account|admin\/users|operations|improvements|themes|learning(?:\/[a-zA-Z0-9-]+)?|observations\/[a-zA-Z0-9-]+|review(?:\/[a-zA-Z0-9-]+)?)$/
    return allowed.test(url.pathname) ? url.pathname + url.search + url.hash : null
  } catch { return null }
}

export function destinationFor(membership: Membership, requested: string | null): string {
  const path = safeReturnPath(requested)
  if (!path) return dashboardFor(membership.role)
  const pathname = new URL(path, 'https://workspace.invalid').pathname
  const permitted = pathname === '/account'
    || (membership.role === 'client' && (pathname === '/workspace' || pathname.startsWith('/observations/')))
    || (['client', 'product_owner'].includes(membership.role) && (pathname === '/themes' || pathname === '/learning' || pathname.startsWith('/learning/')))
    || (membership.role === 'admin' && pathname === '/admin/users')
    || (membership.role === 'employee' && pathname === '/employee')
    || (membership.role === 'moderator' && (pathname === '/review' || pathname.startsWith('/review/')))
    || (['admin', 'employee', 'moderator'].includes(membership.role) && pathname === '/operations')
    || pathname === '/improvements'
  return permitted ? path : dashboardFor(membership.role)
}

export function signInPath(location: { pathname: string; search: string; hash: string }): string {
  const requested = safeReturnPath(location.pathname + location.search + location.hash)
  return '/connect' + (requested ? '?returnTo=' + encodeURIComponent(requested) : '')
}
