import { describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'
import { parseUser } from './session'
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, meta: {} }), { status: 200 })
const tokens = { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', token_type: 'bearer' }
describe('documented HTTP client contracts (mock transport, not live backend)', () => {
  it('uses the configured origin, unwraps envelopes and sends no token on public requests', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok([]))
    const client = new ApiClient('https://api.example.test/api/v1', fetcher)
    expect((await client.request('/products?page=1', { auth: false })).data).toEqual([])
    expect(fetcher.mock.calls[0][0]).toBe('https://api.example.test/api/v1/products?page=1')
    expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization')
  })
  it('refreshes concurrent 401s once and retries with the rotated bearer', async () => {
    let refreshes = 0
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith('/auth/login')) return ok(tokens)
      if (String(url).endsWith('/auth/refresh')) { refreshes++; await new Promise(r => setTimeout(r, 5)); return ok({ ...tokens, access_token: 'rotated' }) }
      return (init?.headers as Record<string, string>).Authorization === 'Bearer rotated' ? ok({ id: 'safe' }) : new Response('{}', { status: 401 })
    })
    const client = new ApiClient('https://api.example.test/api/v1', fetcher)
    await client.login('synthetic@example.com', 'synthetic-test-only')
    await Promise.all([client.request('/auth/me'), client.request('/observations')])
    expect(refreshes).toBe(1)
  })
  it('does not retry unsafe writes on network failure and does not use fixtures', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))
    const client = new ApiClient('https://api.example.test/api/v1', fetcher)
    await expect(client.request('/demo-enquiries', { auth: false, method: 'POST', body: { name: 'Synthetic' } })).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('clears the session after failed refresh and denies subsequent protected requests', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(ok(tokens)).mockResolvedValue(new Response('{}', { status: 401 }))
    const client = new ApiClient('https://api.example.test/api/v1', fetcher)
    const expired = vi.fn(); client.onExpired = expired
    await client.login('synthetic@example.com', 'synthetic-test-only')
    await expect(client.request('/auth/me')).rejects.toThrow()
    await expect(client.request('/auth/me')).rejects.toThrow('Please sign in')
    expect(expired).toHaveBeenCalledOnce()
  })
  it('rejects unverified identities and inactive memberships instead of trusting UI roles', () => {
    expect(() => parseUser({ id: 'x', is_active: true, is_verified: false, memberships: [] })).toThrow('verified')
    expect(parseUser({ id: 'x', is_active: true, is_verified: true, memberships: [{ organisation_id: 'a', role: 'admin', is_active: false }] }).memberships).toEqual([])
  })
  it('does not resurrect a session when an in-flight refresh finishes after sign-out', async () => {
    let release: ((response: Response) => void) | undefined
    const fetcher = vi.fn<typeof fetch>(async url => {
      if (String(url).endsWith('/auth/login')) return ok(tokens)
      if (String(url).endsWith('/auth/refresh')) return new Promise<Response>(resolve => { release = resolve })
      return new Response('{}', { status: 401 })
    })
    const client = new ApiClient('https://api.example.test/api/v1', fetcher)
    await client.login('synthetic@example.com', 'synthetic-test-only')
    const request = client.request('/auth/me')
    const assertion = expect(request).rejects.toThrow('session has changed')
    await vi.waitFor(() => expect(release).toBeDefined())
    client.clearSession()
    release!(ok(tokens))
    await assertion
    await expect(client.request('/auth/me')).rejects.toThrow('Please sign in')
  })
})
