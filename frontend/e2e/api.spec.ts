import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const productId = '11111111-1111-4111-8111-111111111111', org = '22222222-2222-4222-8222-222222222222', obsId = '33333333-3333-4333-8333-333333333333', sharedId = '44444444-4444-4444-8444-444444444444'
// These are illustrative response contracts, not a running backend or persistence test.
async function contractBackend(page: Page, role = 'client', unsafeShared = false) {
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = []
  const product = { id: productId, slug: 'synthetic-analysis', name: 'API Synthetic Analysis', description: 'Synthetic API product', category: 'Lending', is_published: true }
  let observation = { id: obsId, title: 'Submitted synthetic observation', description: 'PRIVATE-SOURCE synthetic branch information.', organisation_id: org, created_by_user_id: 'user-synthetic', status: 'private', consent_status: role === 'moderator' ? 'granted' : 'not_granted' }
  let reviewed = false, published = role === 'client', status = 'proposed'
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), method = request.method(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', '')
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' }
    if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return }
    const body = request.postDataJSON() as Record<string, unknown> | null
    calls.push({ method, path, body: body ?? {} })
    let data: unknown, meta = { page: Number(url.searchParams.get('page') ?? 1), page_size: 20, total: 1, total_pages: 1 }
    const safe = unsafeShared ? { id: sharedId, observation: { description: 'PRIVATE-SOURCE must never be displayed' } } : { id: sharedId, title: 'Approved synthetic context', content: 'Reviewed synthetic wording only.' }
    if (path === '/health') data = { status: 'ok' }
    else if (path === '/auth/login' || path === '/auth/refresh') data = { access_token: 'synthetic-contract-access', refresh_token: 'synthetic-contract-refresh', token_type: 'bearer' }
    else if (path === '/auth/me') data = { id: 'user-synthetic', email: 'synthetic@example.com', full_name: 'Synthetic Account', is_active: true, is_verified: true, memberships: [{ organisation_id: org, organisation_name: 'Fictional API Bank', role, is_active: true }] }
    else if (path === '/products' && method === 'GET') { data = [{ ...product, name: meta.page === 2 ? 'Second page product' : product.name }]; meta = { ...meta, total: 2, total_pages: 2 } }
    else if (path === `/products/${productId}`) data = product
    else if (path === '/demo-enquiries' && method === 'POST') data = { id: 'enquiry-synthetic' }
    else if (path === '/demo-enquiries') data = [{ id: 'enquiry-synthetic', status: 'new', organisation_name: 'Fictional API Bank', product_interest: 'Synthetic analysis' }]
    else if (path.startsWith('/demo-enquiries/')) data = { id: 'enquiry-synthetic', status: body?.status ?? 'new', name: 'Synthetic', work_email: 'synthetic@example.com', requirements: 'Synthetic requirements' }
    else if (path === '/observations' && method === 'POST') { observation = { ...observation, ...body, consent_status: 'not_granted' }; data = observation }
    else if (path === '/observations') data = [observation]
    else if (path === `/observations/${obsId}/consent`) { observation = { ...observation, consent_status: method === 'POST' ? 'granted' : 'withdrawn' }; if (method === 'DELETE') published = false; data = observation }
    else if (path === `/observations/${obsId}`) data = observation
    else if (path === '/moderation/observations') data = reviewed ? [] : [observation]
    else if (path.endsWith('/decision')) { reviewed = true; data = { decision: body?.decision } }
    else if (path.endsWith('/publish')) { published = true; data = { id: sharedId, observation_id: obsId, status: 'published' } }
    else if (path === '/shared-learning') data = published ? [safe] : []
    else if (path.startsWith('/shared-learning/')) { if (method === 'DELETE') published = false; data = safe }
    else if (path === '/product-improvements' && method === 'POST') data = { id: 'idea-synthetic', ...body, status }
    else if (path === '/product-improvements') data = [{ id: 'idea-synthetic', title: 'Synthetic improvement', description: 'Synthetic proposed outcome', status, organisation_id: org, evidence: [{ active: true }] }]
    else if (path.endsWith('/status')) { status = String(body?.status); data = { id: 'idea-synthetic', status } }
    else if (path === '/audit-events') data = [{ id: 'audit-synthetic', action: 'publication_reviewed', occurred_at: '2026-10-30T16:00:00Z', private_metadata: 'DO-NOT-RENDER' }]
    else if (path === '/entitlements/product' || path === '/products') data = { id: productId, ...body }
    else { await route.fulfill({ status: 404, headers, json: { success: false, error: { code: 'NOT_DOCUMENTED' }, data: null } }); return }
    await route.fulfill({ headers, json: { success: true, message: 'Contract mock acknowledged', data, meta } })
  })
  return calls
}
async function connect(page: Page, signIn = true) {
  await page.goto('/connect')
  if (signIn) {
    await page.getByLabel('Email address', { exact: true }).fill('synthetic@example.com')
    await page.getByLabel('Password', { exact: true }).fill('synthetic-test-only')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Signed-in profile' })).toBeVisible()
  }
}

test('contract mock: API catalogue pagination and documented enquiry payload', async ({ page }) => {
  const calls = await contractBackend(page)
  await connect(page, false)
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'AI offerings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'API Synthetic Analysis', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByRole('heading', { name: 'Second page product' })).toBeVisible()
  await page.getByRole('link', { name: /Explore offering/ }).click()
  await page.getByRole('link', { name: 'Request a demo', exact: true }).click()
  await page.getByLabel('Your name', { exact: true }).fill('Synthetic Person')
  await page.getByLabel('Work email').fill('synthetic@example.com')
  await page.getByLabel('Organisation', { exact: true }).fill('Fictional API Bank')
  await page.getByLabel('Product interest').fill('Analysis')
  await page.getByLabel('Requirements (10–5000 characters)').fill('Synthetic test requirements.')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Submit enquiry to API' }).click()
  await expect(page.getByRole('status')).toContainText('API acknowledged')
  const call = calls.find(c => c.path === '/demo-enquiries' && c.method === 'POST')!
  expect(call.body).toMatchObject({ work_email: 'synthetic@example.com', product_id: productId, requirements: 'Synthetic test requirements.' })
  expect(call.body).not.toHaveProperty('email')
})

test('contract mock: create without automatic consent, explicit grant, withdrawal and feed refresh', async ({ page }) => {
  const calls = await contractBackend(page)
  await connect(page)
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await page.getByRole('link', { name: 'New observation' }).click()
  await page.getByLabel('Title', { exact: true }).fill('API synthetic observation')
  await page.getByLabel('Observation (10–10000 characters)').fill('Synthetic observation for this contract test.')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create organisation observation' }).click()
  await page.getByRole('link', { name: 'View observation', exact: true }).click()
  expect(calls.filter(c => c.path.endsWith('/consent'))).toHaveLength(0)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Grant sharing consent' }).click()
  await expect(page.getByRole('button', { name: 'Withdraw sharing consent' })).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Withdraw sharing consent' }).click()
  await expect(page.getByText('Sharing consent: withdrawn')).toBeVisible()
  await page.getByRole('link', { name: 'Approved learning', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No approved learning available' })).toBeVisible()
  expect(calls.find(c => c.path === '/observations' && c.method === 'POST')?.body.organisation_id).toBe(org)
})

test('contract mock: moderator approval and publication are separate calls', async ({ page }) => {
  const calls = await contractBackend(page, 'moderator')
  await connect(page)
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await page.getByRole('link', { name: 'Moderator review', exact: true }).click()
  await page.getByRole('link', { name: 'Review proposal' }).click()
  await page.getByLabel('Decision reason').fill('Removed synthetic identifying details.')
  await page.getByLabel('Reviewed title (required for approval)').fill('Safe synthetic title')
  await page.getByLabel('Reviewed body (required for approval)').fill('Safe reviewed synthetic body.')
  await page.getByRole('checkbox', { name: /I reviewed this decision/ }).check()
  await page.getByRole('button', { name: 'Record moderation decision' }).click()
  await expect(page.getByRole('heading', { name: 'Approval acknowledged.' })).toBeVisible()
  expect(calls.filter(c => c.path.endsWith('/publish'))).toHaveLength(0)
  await page.getByRole('checkbox', { name: /I confirm publication/ }).check()
  await page.getByRole('button', { name: 'Publish approved copy', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('API acknowledged')
  expect(calls.some(c => c.path.endsWith('/publish') && c.method === 'POST')).toBe(true)
})

test('contract mock: client-safe copy and detail never render private source metadata', async ({ page }) => {
  await contractBackend(page)
  await connect(page)
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await page.getByRole('link', { name: 'Approved learning', exact: true }).click()
  await expect(page.getByRole('article')).toContainText('Reviewed synthetic wording only.')
  await expect(page.getByRole('article')).not.toContainText('PRIVATE-SOURCE')
  await page.getByRole('link', { name: 'View approved contribution' }).click()
  await expect(page.getByRole('article')).toContainText('Approved synthetic context')
  await expect(page.getByRole('link', { name: 'Moderator review', exact: true })).toHaveCount(0)
})

test('contract mock: unsupported shared schema fails closed without a private fallback', async ({ page }) => {
  await contractBackend(page, 'client', true)
  await connect(page)
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await page.getByRole('link', { name: 'Approved learning', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'API contract needs attention' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('PRIVATE-SOURCE')
})

test('contract mock: owner improvement transitions and evidence-linked creation', async ({ page }) => {
  const calls = await contractBackend(page, 'product_owner')
  await connect(page)
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await page.getByRole('link', { name: 'Product improvements', exact: true }).click()
  await page.getByLabel('Status reason').fill('Reviewing synthetic evidence.')
  await page.getByRole('button', { name: 'Update improvement status' }).click()
  await expect(page.getByText('under review', { exact: true })).toBeVisible()
  await page.getByLabel('Improvement title').fill('Evidence-linked synthetic idea')
  await page.getByLabel('Problem and proposed outcome').fill('Synthetic problem and proposed outcome.')
  await page.getByLabel('Product UUID', { exact: true }).fill(productId)
  await page.getByLabel('Approved shared-entry UUIDs (comma-separated)').fill(sharedId)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create evidence-linked improvement' }).click()
  await expect.poll(() => calls.find(c => c.path === '/product-improvements' && c.method === 'POST')).toBeTruthy()
})

test('contract mock: connection failure is explicit and API login reflows accessibly', async ({ page }) => {
  await page.route('**/api/v1/**', route => route.abort('connectionrefused'))
  await connect(page, false)
  await page.getByLabel('Email address', { exact: true }).fill('synthetic@example.com')
  await page.getByLabel('Password', { exact: true }).fill('nonfunctional-test-input')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Sign-in is temporarily unavailable')
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
})

test('contract mock: admin operations use the documented management endpoints', async ({ page }) => {
  const calls = await contractBackend(page, 'admin')
  await connect(page)
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await page.getByRole('link', { name: 'Operations', exact: true }).click()
  await page.getByRole('button', { name: 'Open enquiry', exact: true }).click()
  await page.getByLabel('Enquiry status', { exact: true }).selectOption('in_review')
  await page.getByRole('button', { name: 'Update enquiry status' }).click()
  await expect.poll(() => calls.some(c => c.path.endsWith('/enquiry-synthetic/status') && c.body.status === 'in_review')).toBe(true)
  await page.getByRole('button', { name: 'Products', exact: true }).click()
  const create = page.getByRole('heading', { name: 'Create product', exact: true }).locator('..')
  await create.getByLabel('Product name').fill('Synthetic new product')
  await create.getByRole('button', { name: 'Create unpublished product' }).click()
  await expect(create.getByRole('status')).toBeVisible()
  expect(calls.find(c => c.path === '/products' && c.method === 'POST')?.body.is_published).toBe(false)
  const edit = page.getByRole('heading', { name: 'Edit product', exact: true }).locator('..')
  await edit.getByLabel('Product UUID').fill(productId)
  await edit.getByLabel('Product name').fill('Synthetic updated product')
  await edit.getByRole('button', { name: 'Update product details' }).click()
  await expect(edit.getByRole('status')).toBeVisible()
  const unpublish = page.getByRole('heading', { name: 'Unpublish product', exact: true }).locator('..')
  await unpublish.getByLabel('Product UUID').fill(productId)
  await unpublish.getByRole('checkbox').check()
  await unpublish.getByRole('button', { name: 'Unpublish product', exact: true }).click()
  await expect(unpublish.getByRole('status')).toBeVisible()
  await page.getByRole('button', { name: 'Entitlements', exact: true }).click()
  await page.getByLabel('Product UUID', { exact: true }).fill(productId)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Save product entitlement' }).click()
  await expect(page.getByRole('status')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Unpublish', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Audit', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'publication_reviewed' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('DO-NOT-RENDER')
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
})

test('contract mock: reload keeps API mode but clears credentials; sign-out does not call an invented endpoint', async ({ page }) => {
  const calls = await contractBackend(page)
  await connect(page)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  expect(calls.some(c => c.path.includes('logout'))).toBe(false)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.locator('header').getByRole('link', { name: 'Client workspace' })).toBeVisible()
  await expect(page.locator('.demo-banner')).toHaveCount(0)
})

test('contract mock: a foreign-organisation response is not rendered in the selected workspace', async ({ page }) => {
  await contractBackend(page)
  await connect(page)
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await page.route(`**/api/v1/observations/${obsId}`, route => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { success: true, message: 'Mock scope mismatch', data: { id: obsId, organisation_id: 'other-organisation', title: 'FOREIGN-PRIVATE-TITLE', description: 'FOREIGN-PRIVATE-BODY' }, meta: {} } }))
  await page.getByRole('link', { name: 'View observation', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'API contract needs attention' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('FOREIGN-PRIVATE')
})

test('contract mock: unpublishing requires moderator membership', async ({ page }) => {
  const calls = await contractBackend(page, 'moderator')
  await connect(page)
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await page.getByRole('link', { name: 'Operations', exact: true }).click()
  await page.getByRole('button', { name: 'Unpublish', exact: true }).click()
  await page.getByLabel('Shared-entry UUID').fill(sharedId)
  await page.getByLabel('Unpublication reason').fill('Synthetic moderation test')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Unpublish shared contribution' }).click()
  await expect(page.getByRole('status')).toBeVisible()
  expect(calls.some(c => c.method === 'DELETE' && c.path === '/shared-learning/' + sharedId)).toBe(true)
})
