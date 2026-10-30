import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowUpRight, Menu, X } from 'lucide-react'

export function Shell() {
  const [open, setOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const main = useRef<HTMLElement>(null)
  const previousPath = useRef<string | null>(null)
  const { pathname } = useLocation()
  useEffect(() => {
    if (previousPath.current === pathname) return
    if (previousPath.current !== null) main.current?.focus()
    previousPath.current = pathname
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  function closeMenu() { setOpen(false); menuButton.current?.focus() }
  return <>
    <a href="#main" className="skip-link">Skip to content</a>
    <header className="site-header"><div className="container header-inner">
      <Link className="brand" to="/" aria-label="Azentio.ai home"><span>azentio<span className="brand-ai">.ai</span></span></Link>
      <button className="icon-button menu-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="primary-navigation" ref={menuButton} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      <nav id="primary-navigation" aria-label="Primary" className={open ? 'primary-nav is-open' : 'primary-nav'} onKeyDown={e => { if (e.key === 'Escape') closeMenu() }}>
        <NavLink to="/" end onClick={() => setOpen(false)}>Overview</NavLink>
        <NavLink to="/offerings" onClick={() => setOpen(false)}>AI offerings</NavLink>
        <NavLink to="/learning" onClick={() => setOpen(false)}>Shared learning</NavLink>
        <NavLink to="/workspace" className="portal-link" onClick={() => setOpen(false)}>Client workspace <ArrowUpRight size={15} aria-hidden="true" /></NavLink>
      </nav>
    </div></header>
    <main id="main" ref={main} tabIndex={-1}><Outlet /></main>
    <footer className="site-footer"><div className="container footer-inner"><Link className="brand footer-brand" to="/">azentio<span className="brand-ai">.ai</span></Link><nav className="footer-nav" aria-label="Footer"><Link to="/offerings">AI offerings</Link><Link to="/learning">Shared learning</Link><Link to="/connect">Client sign-in</Link></nav></div></footer>
  </>
}
