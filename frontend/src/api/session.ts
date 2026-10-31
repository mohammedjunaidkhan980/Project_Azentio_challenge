import { createContext, useContext } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ApiError, object, records, text } from './client'
export interface Membership { organisation_id: string; organisation_name: string; role: string; is_active: boolean }
export interface User { id: string; email: string; full_name: string; is_verified: boolean; memberships: Membership[] }
export function parseUser(value: unknown): User {
  const u = object(value)
  if (u.is_active !== true || u.is_verified !== true || !text(u.id)) throw new ApiError(403, 'IDENTITY_NOT_APPROVED', 'A verified, active identity is required. Ask your administrator to approve the account.')
  return { id: text(u.id), email: text(u.email), full_name: text(u.full_name), is_verified: true, memberships: records(u.memberships).filter(m => m.is_active === true && ['client', 'employee', 'moderator', 'product_owner', 'admin'].includes(text(m.role))).map(m => ({ organisation_id: text(m.organisation_id), organisation_name: text(m.organisation_name), role: text(m.role), is_active: true })).filter(m => m.organisation_id) }
}
export interface Session { mode: 'demo' | 'api'; setMode: (mode: 'demo' | 'api') => void; user: User | null; membership: Membership | undefined; setOrganisation: Dispatch<SetStateAction<string>>; login: (email: string, password: string) => Promise<void>; logout: () => void; scopeKey: string }
export const SessionContext = createContext<Session | null>(null)
export function useSession() { const session = useContext(SessionContext); if (!session) throw new Error('Session provider missing'); return session }
