import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './client'
import { services } from './services'
import { parseUser, SessionContext } from './session'
import type { User } from './session'
export function SessionProvider({ children }: { children: ReactNode }) {
  const [mode, updateMode] = useState<'api' | 'demo'>(() => { try { const saved = sessionStorage.getItem('azentio-data-mode'); if (saved === 'api' || saved === 'demo') return saved } catch { /* Storage may be disabled; no credential is persisted. */ } return import.meta.env.VITE_DATA_MODE === 'demo' ? 'demo' : 'api' })
  const [sessionNotice, setSessionNotice] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [organisation, setOrganisation] = useState('')
  const membership = user?.memberships.find(m => m.organisation_id === organisation)
  function logout() { setSessionNotice('You have been signed out.'); api.clearSession(); setUser(null); setOrganisation('') }
  useEffect(() => { api.onExpired = () => { setSessionNotice('Your session has ended. Please sign in again.'); setUser(null); setOrganisation('') }; return () => { api.onExpired = () => {} } }, [])
  async function login(email: string, password: string) {
    setSessionNotice('')
    await api.login(email, password)
    try { const current = parseUser((await services.me()).data); setUser(current); setOrganisation(current.memberships.length === 1 ? current.memberships[0].organisation_id : '') }
    catch (e) { logout(); setSessionNotice(''); throw e }
  }
  function setMode(next: 'demo' | 'api') { logout(); setSessionNotice(''); try { sessionStorage.setItem('azentio-data-mode', next) } catch { /* Only the non-secret display preference is persisted when available. */ } updateMode(next) }
  return <SessionContext value={{ mode, setMode, user, membership, setOrganisation, login, logout, sessionNotice, scopeKey: `${mode}:${user?.id ?? 'public'}:${membership?.organisation_id ?? 'none'}` }}>{children}</SessionContext>
}
