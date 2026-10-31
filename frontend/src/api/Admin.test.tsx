import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Register } from './Admin'
afterEach(() => vi.unstubAllGlobals())
it('registration sends only the three documented fields and does not grant a membership (mock)', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { is_verified: false, memberships: [] }, meta: {} })))
  vi.stubGlobal('fetch', fetcher)
  render(<MemoryRouter><Register /></MemoryRouter>)
  await userEvent.type(screen.getByLabelText('Full name'), 'Synthetic User')
  await userEvent.type(screen.getByLabelText('Email address'), 'synthetic@example.com')
  await userEvent.type(screen.getByLabelText('New password'), 'nonfunctional-test-input')
  await userEvent.click(screen.getByRole('button', { name: 'Register account' }))
  await screen.findByRole('status')
  expect(Object.keys(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).sort()).toEqual(['email', 'full_name', 'password'])
  expect(fetcher.mock.calls[0][0]).toContain('/auth/register')
})
