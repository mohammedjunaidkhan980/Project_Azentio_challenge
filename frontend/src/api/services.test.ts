import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'
import { services } from './services'
afterEach(() => { api.clearSession(); vi.unstubAllGlobals() })
const cases: [string, string, () => Promise<unknown>][] = [
  ['GET', '/health', () => services.health()],
  ['GET', '/auth/me', () => services.me()],
  ['GET', '/products?page=2&page_size=20', () => services.products(2)],
  ['GET', '/products/p', () => services.product('p')],
  ['POST', '/products', () => services.createProduct({ name: 'Synthetic', is_published: false })],
  ['PATCH', '/products/p', () => services.updateProduct('p', { name: 'Updated' })],
  ['DELETE', '/products/p', () => services.unpublishProduct('p')],
  ['POST', '/demo-enquiries', () => services.enquire({ name: 'Synthetic', work_email: 'synthetic@example.com', organisation_name: 'Fictional', product_interest: 'Synthetic', requirements: 'Synthetic request' })],
  ['GET', '/demo-enquiries?page=1&page_size=20', () => services.enquiries()],
  ['GET', '/demo-enquiries/e', () => services.enquiry('e')],
  ['PATCH', '/demo-enquiries/e/status', () => services.enquiryStatus('e', 'in_review')],
  ['GET', '/observations?page=1&page_size=20&organisation_id=org-a', () => services.observations('org-a')],
  ['GET', '/observations/o', () => services.observation('o')],
  ['POST', '/observations', () => services.createObservation({ title: 'Synthetic', description: 'Synthetic example', organisation_id: 'org-a' })],
  ['POST', '/observations/o/consent', () => services.consent('o', true, 'Explicit permission')],
  ['DELETE', '/observations/o/consent', () => services.consent('o', false, 'Withdrawn')],
  ['GET', '/moderation/observations?page=1&page_size=20', () => services.queue()],
  ['POST', '/moderation/observations/o/decision', () => services.decide('o', { decision: 'approved', reason: 'Safe copy reviewed', redacted_title: 'Safe', redacted_content: 'Synthetic only' })],
  ['POST', '/moderation/observations/o/publish', () => services.publish('o')],
  ['GET', '/shared-learning?page=1&page_size=20', () => services.learning()],
  ['GET', '/shared-learning/s', () => services.shared('s')],
  ['DELETE', '/shared-learning/s?reason=Unsafe+content', () => services.unpublish('s', 'Unsafe content')],
  ['POST', '/entitlements/product', () => services.entitlement({ organisation_id: 'org-a', product_id: 'p', is_active: true })],
  ['GET', '/product-improvements?page=1&page_size=20', () => services.improvements()],
  ['POST', '/product-improvements', () => services.createImprovement({ title: 'Synthetic idea', description: 'Synthetic outcome', product_id: 'p', organisation_id: 'org-a', evidence_entry_ids: ['s'] })],
  ['PATCH', '/product-improvements/i/status', () => services.improvementStatus('i', 'under_review', 'Checking evidence')],
  ['GET', '/audit-events?page=1&page_size=20', () => services.audit()],
]
describe('Phase 1–4 endpoint request contracts — mocked fetch only', () => {
  it.each(cases)('%s %s', async (method, path, call) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => new Response(JSON.stringify({ success: true, message: 'OK', data: String(url).endsWith('/auth/login') ? { access_token: 'test-only', refresh_token: 'test-refresh-only', token_type: 'bearer' } : {}, meta: {} })))
    vi.stubGlobal('fetch', fetcher)
    await api.login('synthetic@example.com', 'test-only')
    await call()
    const [url, options] = fetcher.mock.calls.at(-1)!
    expect(url).toBe(api.baseURL + path)
    expect(options?.method).toBe(method)
    if (!['/health', '/products', '/products/p', '/demo-enquiries'].includes(path.split('?')[0]) || method !== 'GET' && path !== '/demo-enquiries') expect(options?.headers).toHaveProperty('Authorization', 'Bearer test-only')
  })
})
