import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from './client'
import { useSession } from './session'
import { Notice } from '../components/ui'

export function Connection() {
  const { mode, setMode, user, login, logout } = useSession()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (mode !== 'api') setMode('api') }, [mode, setMode])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try { await login(String(data.get('email')).trim(), String(data.get('password'))) }
    catch (cause) {
      const failure = cause instanceof ApiError ? cause : null
      setError(failure?.status === 401 ? 'The email or password is incorrect. Please try again.'
        : failure?.status === 403 ? 'Your account needs approval or access to this workspace. Please contact your administrator.'
        : failure?.status === 422 ? 'Check your email address and password, then try again.'
        : 'Sign-in is temporarily unavailable. Please try again shortly.')
    } finally { setPending(false) }
  }

  return <div className="container login-page"><section className="login-card" aria-labelledby="login-title">
    <p className="eyebrow">AZENTIO.AI</p>
    <h1 id="login-title">{user ? 'Your workspace' : 'Welcome back'}</h1>
    <p className="login-intro">{user ? 'You are signed in to your organisation’s workspace.' : "Sign in to access your organisation's workspace."}</p>
    {user ? <div className="login-profile"><h2>Signed-in profile</h2><p>{user.full_name}</p><p>{user.email}</p>
      <Link className="button button-primary" to="/workspace">Open workspace</Link>
      <button className="button button-secondary" onClick={logout}>Sign out</button>
    </div> : <form onSubmit={submit} aria-label="Sign in" aria-busy={pending}>
      <div className="field"><label htmlFor="login-email">Email address</label><input id="login-email" name="email" type="email" autoComplete="username" required maxLength={255} /></div>
      <div className="field"><label htmlFor="login-password">Password</label><input id="login-password" name="password" type="password" autoComplete="current-password" required /></div>
      {error && <Notice error>{error}</Notice>}
      <button className="button button-primary login-submit" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      <p className="login-register">New to Azentio.ai? <Link to="/register">Create an account</Link></p>
    </form>}
  </section></div>
}
