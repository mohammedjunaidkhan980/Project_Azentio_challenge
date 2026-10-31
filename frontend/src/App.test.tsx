import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'

beforeEach(() => sessionStorage.setItem('azentio-data-mode', 'demo'))
afterEach(() => sessionStorage.clear())

describe('application shell', () => {
  it('keeps public pages free of prototype labels and preserves client access', () => {
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(screen.queryByText(/Challenge 7|Hackathon prototype|Considered intelligence/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Client workspace' })).toHaveAttribute('href', '/workspace')
    expect(within(screen.getByRole('navigation', { name: 'Footer' })).getByRole('link', { name: 'Client sign-in' })).toHaveAttribute('href', '/connect')
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })
  it('keeps sample data and simulated permission disclosures in the preview workspace', () => {
    render(<MemoryRouter initialEntries={['/workspace']}><App /></MemoryRouter>)
    expect(screen.getByText('Sample data · Preview workspace')).toBeVisible()
    expect(screen.getByText('Preview persona — simulated permissions')).toBeVisible()
  })
  it('provides a recoverable unknown route', async () => {
    render(<MemoryRouter initialEntries={['/missing']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await userEvent.click(screen.getByRole('link', { name: /Back to overview/ }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Enterprise AI for\s*financial services\./)
  })
})
