import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const file = process.env.AZENTIO_PRESENTATION_CREDENTIALS
if (!file) throw new Error('Private synthetic account manifest required')
const fixture = JSON.parse(readFileSync(file, 'utf8'))
const folder = resolve('.local/autonomous-qa', process.env.AZENTIO_QA_RUN ?? 'current')
mkdirSync(folder, { recursive: true })
test.use({ actionTimeout: 10000, navigationTimeout: 15000 })
type Row = { input: string; expected: string; actual: string; status: string }
let rows: Row[], traffic: { method: string; path: string; status: number }[], visited: string[], errors: number, screenshots: string[]
function record(input: string, expected: string, actual: string, status = 'PASS') { rows.push({ input, expected, actual, status }) }
async function loaded(page: Page) { await expect(page.locator('[aria-busy="true"]')).toHaveCount(0) }
async function shot(page: Page, label: string) {
  await loaded(page)
  const path = join(folder, `${label}.png`); await page.screenshot({ path, fullPage: true, animations: 'disabled' }); screenshots.push(path)
}
async function login(page: Page, role: string, path = '/connect', accounts = fixture.users) {
  await page.goto(path)
  await page.getByLabel('Work email', { exact: true }).fill(accounts[role].email)
  await page.locator('input[name="password"]').evaluate((el, password) => { (el as HTMLInputElement).value = password }, accounts[role].password)
  const auth = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const response = await auth; expect(response.status()).toBe(200)
  await expect(page.getByRole('navigation', { name: 'Workspace', exact: true })).toBeVisible(); await loaded(page)
  record(role + ' real sign-in', 'JWT200 and server role dashboard', page.url())
  return { Authorization: 'Bearer ' + (await response.json()).data.access_token }
}
test.beforeEach(async ({ page }) => {
  rows = []; traffic = []; visited = []; errors = 0; screenshots = []
  page.on('response', r => { const p = new URL(r.url()).pathname; if (p.startsWith('/api/v1/')) traffic.push({ method: r.request().method(), path: p, status: r.status() }) })
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) visited.push(frame.url()) })
  page.on('pageerror', () => { errors++ })
})
test.afterEach(async ({ page }, info) => {
  if (info.status !== 'passed') {
    await page.locator('input[type="password"]').evaluateAll(inputs => inputs.forEach(input => { (input as HTMLInputElement).value = '' })).catch(() => {})
    const path = join(folder, 'failure-' + Date.now() + '.png'); await page.screenshot({ path, fullPage: true }).catch(() => {}); screenshots.push(path)
  }
  writeFileSync(join(folder, info.title.replace(/[^a-z0-9]+/gi, '-') + '.json'), JSON.stringify({ scenario: info.title, status: info.status, rows, traffic, visited, errors, screenshots, failure: info.error?.message.slice(0, 600) }, null, 2))
})

test('REAL public catalogue enquiry validation responsive and errors', async ({ page }) => {
  await page.goto('/connect'); await shot(page, '01-empty-login')
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'AI offerings', exact: true }).click(); await loaded(page)
  await expect(page.locator('main')).not.toContainText(/placeholder|SYNTHETIC Theme|No description provided/)
  await page.getByRole('textbox', { name: 'Search this product page' }).fill('Document')
  await expect(page.getByRole('heading', { name: 'Document Intelligence', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Financial Analysis Intelligence', exact: true })).toHaveCount(0)
  record('Catalogue search: Document', 'Only matching real offering', 'Document Intelligence')
  await page.getByRole('textbox', { name: 'Search this product page' }).fill('no-such-offering-qa')
  await expect(page.getByRole('heading', { name: 'No published products found' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Search this product page' }).fill('Financial')
  await page.getByRole('link', { name: 'Explore offering: Financial Analysis Intelligence' }).click()
  await page.getByRole('link', { name: 'Request a demo', exact: true }).click()
  await loaded(page)
  await shot(page, '02-enquiry-before-fix')
  await expect(page.locator('main')).not.toContainText(/configured API|backend contract|fixture mode|configured backend/)
  const submit = page.getByRole('button', { name: /Submit enquiry/ })
  await submit.click()
  expect(await page.locator('input:invalid,textarea:invalid').count()).toBeGreaterThan(0)
  record('Submit empty enquiry', 'Native validation prevents request', 'Required fields invalid; no submission')
  await page.getByLabel('Your name', { exact: true }).fill('Fictional Operations Reviewer')
  await page.getByLabel('Work email', { exact: true }).fill('qa-reviewer@harbour-demo.example.com')
  await page.getByLabel('Organisation', { exact: true }).fill('Harbour Bank QA Demo')
  await page.getByLabel('Product interest').fill('Document verification workflow')
  await page.getByLabel('Requirements (10–5000 characters)').fill('Can Azentio reduce repeated document verification checks while keeping human approval for exceptions?')
  await page.getByRole('checkbox').check()
  const saved = page.waitForResponse(r => r.url().endsWith('/demo-enquiries') && r.request().method() === 'POST')
  await submit.click(); const response = await saved; expect(response.status()).toBe(201)
  const id = (await response.json()).data.id
  writeFileSync(join(folder, 'enquiry-id.txt'), id)
  await expect(page.getByRole('status')).toBeVisible(); await shot(page, '03-enquiry-saved')
  record('Submit realistic enquiry', 'Real HTTP201; no email-delivery claim', 'Persisted enquiry ID ' + id)
  for (const width of [320, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width) }
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
  await page.goto('/not-a-real-route'); await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to overview', exact: true }).click(); await expect(page).toHaveURL(/\/$/)
  expect(errors).toBe(0)
})

for (const role of ['client', 'summit', 'orchard', 'owner', 'moderator', 'admin', 'employee']) {
  test(`REAL role navigation logout refresh and responsive: ${role}`, async ({ page }) => {
    await login(page, role)
    const nav = page.getByRole('navigation', { name: 'Workspace', exact: true })
    const links = await nav.locator('a').evaluateAll(items => items.map(a => ({ href: a.getAttribute('href')!, label: a.textContent! })))
    for (const link of links) {
      await nav.getByRole('link', { name: link.label, exact: true }).click(); await loaded(page)
      await expect(page).toHaveURL(new RegExp(link.href.replaceAll('/', '\\/') + '$'))
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      record(role + ': ' + link.label, 'Permitted page loads with no JS exception', page.url())
      if (link.href === '/operations') {
        const tabs = page.getByRole('navigation', { name: 'Operations sections' })
        const names = await tabs.getByRole('button').allTextContents()
        for (const name of names) {
          await tabs.getByRole('button', { name, exact: true }).click(); await loaded(page)
          record(role + ': Operations/' + name, 'Supported section available', 'Loaded real section')
          if (name === 'Audit' && await page.getByRole('button', { name: 'Next page', exact: true }).isEnabled()) {
            await page.getByRole('button', { name: 'Next page', exact: true }).click(); await loaded(page)
            await expect(page.getByText(/Page 2 of/)).toBeVisible()
            await page.getByRole('button', { name: 'Previous page', exact: true }).click(); await loaded(page)
            record('Audit pagination', 'Real second page and return', 'Page2 then Page1; authorised API responses')
          }
        }
      }
    }
    if (role === 'employee') {
      await nav.getByRole('link', { name: 'Employee dashboard', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'No additional resources assigned' })).toBeVisible()
      await expect(page.getByText('Internal learning, experiments and product playgrounds are not available in this workspace yet.')).toBeVisible()
      record('Employee playground/resources/AI questions', 'Honest unavailable state', 'NOT IMPLEMENTED; no fake launch/chatbot', 'BLOCKED')
      await page.getByRole('link', { name: 'Open operational work' }).click(); await loaded(page)
      await expect(page.getByRole('button', { name: 'Products', exact: true })).toHaveCount(0)
    }
    for (const width of [360, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width) }
    await shot(page, 'role-' + role)
    const destination = new URL(page.url()).pathname
    await page.reload(); await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    record(role + ': refresh', 'Memory-only credentials discarded', 'Real sign-in required; requested URL preserved')
    await login(page, role, destination)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    expect(await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].some(k => /token|password|credential/i.test(k)))).toBe(false)
    record(role + ': logout', 'No credential persistence or workspace', 'Signed out; no tokens/passwords in browser storage')
    expect(errors).toBe(0)
  })
}

test('REAL employee enquiry detail actions and MySQL persistence', async ({ page }) => {
  const id = readFileSync(join(folder, 'enquiry-id.txt'), 'utf8')
  await login(page, 'employee'); await page.getByRole('link', { name: 'Open operational work' }).click(); await loaded(page)
  await page.locator('article').filter({ has: page.getByRole('heading', { name: 'Harbour Bank QA Demo', exact: true }) }).getByRole('button', { name: 'Open enquiry' }).first().click()
  await expect(page.getByRole('heading', { name: 'Enquiry detail', exact: true })).toBeVisible()
  await shot(page, 'employee-enquiry-detail')
  expect((await page.getByRole('heading', { name: 'Enquiry detail', exact: true }).boundingBox())!.y).toBeLessThan(900)
  for (const state of ['in_review', 'responded', 'closed']) {
    await page.getByLabel('Enquiry status', { exact: true }).selectOption(state)
    const update = page.waitForResponse(r => r.url().endsWith('/demo-enquiries/' + id + '/status') && r.request().method() === 'PATCH')
    await page.getByRole('button', { name: 'Update enquiry status' }).click(); expect((await update).status()).toBe(200)
    await expect(page.getByLabel('Enquiry status', { exact: true })).toHaveValue(state)
    record('Enquiry status ' + state, 'Actual persisted transition', 'HTTP200; refreshed select matches ' + state)
  }
  const output = execFileSync(resolve('../.venv/Scripts/python.exe'), ['-m', 'scripts.verify_website_audit', '--enquiry', id], { cwd: resolve('..'), encoding: 'utf8' })
  record('MySQL enquiry persistence', 'Original question and closed state retained', output.trim())
  expect(errors).toBe(0)
})

test('REAL denied APIs unsafe navigation empty search and recovery', async ({ page }) => {
  await page.goto('/connect')
  await page.getByLabel('Work email', { exact: true }).fill(fixture.users.client.email)
  await page.locator('input[name="password"]').evaluate(el => { (el as HTMLInputElement).value = 'incorrect-negative-case' })
  const rejected = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); expect((await rejected).status()).toBe(401)
  await expect(page.getByText('The email or password is incorrect. Please try again.', { exact: true })).toBeVisible()
  await page.locator('input[name="password"]').evaluate(el => { (el as HTMLInputElement).value = '' })
  await shot(page, 'login-error')
  record('Incorrect password', 'Actual auth401 and professional failure without login', 'HTTP401; incorrect-credentials message')
  const headers = await login(page, 'client', '/connect?returnTo=https%3A%2F%2Foutside.example')
  await expect(page).toHaveURL(/\/workspace$/)
  record('External returnTo URL', 'Stay on authorised local dashboard', 'Unsafe redirect rejected; /workspace')
  for (const path of ['/admin/users', '/admin/organisations', '/audit-events', '/moderation/observations', '/products/managed']) {
    const r = await page.request.get('/api/v1' + path, { headers }); expect(r.status()).toBe(403)
    record('Client direct GET ' + path, 'HTTP403 without restricted content', 'HTTP' + r.status())
  }
  const invalid = await page.request.get('/api/v1/auth/me', { headers: { Authorization: 'Bearer invalid-negative-test' } }); expect(invalid.status()).toBe(401)
  record('Invalid bearer credential', 'Real FastAPI401', 'HTTP401')
  const expired = execFileSync(resolve('../.venv/Scripts/python.exe'), ['-m', 'scripts.expired_access_fixture', fixture.users.client.id], { cwd: resolve('..'), encoding: 'utf8' }).trim()
  const expiration = await page.request.get('/api/v1/auth/me', { headers: { Authorization: 'Bearer ' + expired } }); expect(expiration.status()).toBe(401)
  record('Genuinely signed but expired access token', 'Actual FastAPI verifies signature and rejects past expiry', 'HTTP401; negative fixture held only in memory')
  await page.getByRole('link', { name: 'Approved learning', exact: true }).click(); await loaded(page)
  await page.context().setOffline(true)
  await page.getByLabel('Search approved learning').fill('no-result-offline-test')
  await page.getByRole('button', { name: 'Search', exact: true }).click(); await expect(page.getByRole('button', { name: 'Retry request' })).toBeVisible()
  await shot(page, 'network-error-state')
  await page.context().setOffline(false); await page.getByRole('button', { name: 'Retry request' }).click()
  await expect(page.getByRole('heading', { name: 'No approved learning available' })).toBeVisible()
  record('Real offline/retry/empty search', 'Truthful failure then server recovery', 'Offline error, retry200, empty result')
  record('Expiry coverage limit', 'No false claim of waiting out the configured timer', 'Expired JWT API401 and real server-ended UI/refresh401 tested; natural wall-clock wait not performed')
  record('AI business questions', 'Grounded authorised answer if implemented', 'NOT IMPLEMENTED: no AI Q&A endpoint or chatbot; no answer fabricated', 'BLOCKED')
  expect(errors).toBe(0)
})

test('REAL registration approval gate and no self-assigned role', async ({ page }) => {
  const email = 'qa-registration-' + Date.now() + '@fictional-demo.example.com'
  const password = randomBytes(24).toString('base64url') // Memory-only; never recorded.
  await page.goto('/register')
  await page.getByLabel('Full name', { exact: true }).fill('Fictional Registration QA')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.locator('input[name="password"]').evaluate((el, value) => { (el as HTMLInputElement).value = value }, password)
  const registration = page.waitForResponse(r => r.url().endsWith('/auth/register') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Register account', exact: true }).click()
  const response = await registration; expect(response.status()).toBe(201)
  const user = (await response.json()).data
  expect(user.is_verified).toBe(false)
  expect(user.memberships).toEqual([])
  const denied = await page.request.post('/api/v1/auth/login', { data: { email, password } }); expect(denied.status()).toBe(401)
  await page.locator('input[name="password"]').evaluate(el => { (el as HTMLInputElement).value = '' })
  await shot(page, 'registration-approval-required')
  const output = execFileSync(resolve('../.venv/Scripts/python.exe'), ['-m', 'scripts.verify_website_audit', '--registration', user.id], { cwd: resolve('..'), encoding: 'utf8' })
  record('Register fictional account', 'HTTP201, unverified, no membership; login401 until approved', 'HTTP201/401; ' + output.trim())
  record('Self-service verification/invitation', 'Approved identity lifecycle if implemented', 'NOT IMPLEMENTED; no fake verify/invitation button', 'BLOCKED')
  expect(errors).toBe(0)
})

test('REAL server-ended browser session clears workspace and refresh credentials', async ({ page, browser }) => {
  test.skip(!process.env.AZENTIO_DEMO_CREDENTIALS, 'Private disposable client fixture required')
  const disposable = JSON.parse(readFileSync(process.env.AZENTIO_DEMO_CREDENTIALS!, 'utf8'))
  expect(disposable.users.peer_a.id).not.toBe(fixture.users.admin.id)
  const peer = await browser.newPage({ baseURL: 'http://127.0.0.1:5174' })
  peer.on('pageerror', () => { errors++ })
  peer.on('response', r => { const path = new URL(r.url()).pathname; if (path.startsWith('/api/v1/')) traffic.push({ method: r.request().method(), path, status: r.status() }) })
  const admin = await login(page, 'admin')
  const path = '/api/v1/admin/users/' + disposable.users.peer_a.id + '/status'
  try {
    await login(peer, 'peer_a', '/workspace', disposable.users)
    await peer.getByRole('link', { name: 'Account', exact: true }).click()
    await page.locator(`a[href="/admin/users/${disposable.users.peer_a.id}"]`).click()
    let form = page.getByRole('button', { name: 'Save account status', exact: true }).locator('..')
    await form.getByLabel('Account status', { exact: true }).selectOption('false')
    await form.getByRole('checkbox').check()
    let save = page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === 'PATCH')
    await form.getByRole('button').click(); expect((await save).status()).toBe(200)
    await peer.getByRole('link', { name: 'Client dashboard', exact: true }).click()
    await expect(peer.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(peer.getByText('Your session has ended. Please sign in again.', { exact: true })).toBeVisible()
    expect(traffic.some(r => r.path === '/api/v1/auth/refresh' && r.status === 401)).toBe(true)
    await shot(peer, 'server-ended-session')
    record('Server ends an existing real session', 'Protected request401, refresh401, cleared workspace and truthful sign-in notice', 'Actual backend rejected both tokens; browser returned to sign-in')
    form = page.getByRole('button', { name: 'Save account status', exact: true }).locator('..')
    await form.getByLabel('Account status', { exact: true }).selectOption('true')
    await form.getByRole('checkbox').check()
    save = page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === 'PATCH')
    await form.getByRole('button').click(); expect((await save).status()).toBe(200)
    await login(peer, 'peer_a', '/workspace', disposable.users)
    await peer.getByRole('button', { name: 'Sign out', exact: true }).click()
  } finally {
    expect((await page.request.patch(path, { headers: admin, data: { is_active: true } })).status()).toBe(200)
    await peer.context().close()
  }
  expect(errors).toBe(0)
})

test('REAL business tenant privacy and withdrawn search API replay', async ({ page }) => {
  test.skip(!process.env.AZENTIO_QA_BUSINESS_RESULT, 'Completed private business rehearsal result required')
  const business = JSON.parse(readFileSync(process.env.AZENTIO_QA_BUSINESS_RESULT!, 'utf8'))
  const headers = await login(page, 'summit')
  for (const path of ['/observations/' + business.ids.observation, '/shared-learning/' + business.ids.shared]) {
    const response = await page.request.get('/api/v1' + path, { headers }); expect(response.status()).toBe(404)
    record('Summit direct GET ' + path, 'No original/withdrawn content', 'Actual HTTP404; denied')
  }
  for (const query of ['Document verification', 'Loan processing', 'Manual checks', 'FICTIONAL PRIVATE']) {
    const response = await page.request.get('/api/v1/shared-learning?q=' + encodeURIComponent(query), { headers })
    expect(response.status()).toBe(200)
    expect((await response.json()).data.some((row: { id: string }) => row.id === business.ids.shared)).toBe(false)
    record('Withdrawn API search: ' + query, 'Withdrawn item absent from authorised results', 'HTTP200; item absent')
  }
  await page.getByRole('link', { name: 'Product improvements', exact: true }).click(); await loaded(page)
  await expect(page.getByRole('heading', { name: business.improvementTitle, exact: true })).toHaveCount(0)
  const foreign = await page.request.get('/api/v1/product-improvements', { headers })
  expect((await foreign.json()).data.some((row: { id: string }) => row.id === business.ids.improvement)).toBe(false)
  expect((await page.request.patch('/api/v1/product-improvements/' + business.ids.improvement + '/status', { headers, data: { status: 'planned', reason: 'Forbidden cross-tenant change' } })).status()).toBe(403)
  await shot(page, 'foreign-improvement-denied')
  record('Summit views/changes Harbour improvement', 'Foreign idea absent; client status mutation forbidden', 'UI/API list excludes idea; direct PATCH403')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  const author = await login(page, 'client')
  const own = (await (await page.request.get('/api/v1/product-improvements', { headers: author })).json()).data.find((row: { id: string }) => row.id === business.ids.improvement)
  expect(own).toBeTruthy(); expect(own.description).toBe(''); expect(own.status).toBe('under_review')
  expect(own.evidence.every((row: { active: boolean }) => row.active === false)).toBe(true)
  record('Harbour client improvement response', 'Own status visible; owner description hidden; withdrawn evidence inactive', 'Under review; description empty; evidence inactive')
  await page.getByRole('link', { name: 'New observation', exact: true }).click()
  await expect(page.getByText('Saving does not grant sharing consent. Private drafts, editing and resubmission are not currently available.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /save draft|edit observation|resubmit/i })).toHaveCount(0)
  await expect(page.getByLabel('Priority', { exact: true })).toHaveCount(0)
  await shot(page, 'observation-unsupported-options')
  record('Author-private draft/edit/resubmit', 'Only offer implemented lifecycle actions', 'NOT IMPLEMENTED; UI states unavailable and has no fake actions', 'BLOCKED')
  record('High priority and separate business-impact fields', 'Use supported fields without inventing schema', 'NOT IMPLEMENTED as structured fields; impact, suggestion and question saved in description; no priority flag fabricated', 'BLOCKED')
  expect(errors).toBe(0)
})

test('REAL withdrawn consent blocks moderator publication and duplicate unpublication', async ({ page }) => {
  test.skip(!process.env.AZENTIO_QA_BUSINESS_RESULT, 'Completed private business result required')
  const business = JSON.parse(readFileSync(process.env.AZENTIO_QA_BUSINESS_RESULT!, 'utf8'))
  await login(page, 'moderator', '/review/' + business.ids.observation)
  const resume = page.getByRole('button', { name: 'Publish previously approved copy', exact: true }).locator('..')
  await resume.getByRole('checkbox').check()
  let response = page.waitForResponse(r => r.url().endsWith('/moderation/observations/' + business.ids.observation + '/publish') && r.request().method() === 'POST')
  await resume.getByRole('button').click(); expect((await response).status()).toBe(409)
  await expect(page.getByRole('alert')).toBeVisible(); await shot(page, 'withdrawn-publication-rejected')
  record('Moderator resumes publication after withdrawal', 'Consent guard denies publication', 'Real UI POST409; no success or re-publication')
  await page.getByRole('link', { name: 'Operations', exact: true }).click()
  await page.getByLabel('Shared-entry UUID', { exact: true }).fill(business.ids.shared)
  await page.getByLabel('Unpublication reason', { exact: true }).fill('Fictional QA: verify an already withdrawn contribution stays unavailable.')
  await page.getByRole('checkbox').check()
  response = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/shared-learning/' + business.ids.shared) && r.request().method() === 'DELETE')
  await page.getByRole('button', { name: 'Unpublish shared contribution', exact: true }).click(); expect((await response).status()).toBe(409)
  await expect(page.getByRole('alert')).toBeVisible()
  record('Unpublish an already-unpublished copy', 'No state corruption or misleading success', 'Real UI DELETE409; already-unpublished state preserved')
  const output = execFileSync(resolve('../.venv/Scripts/python.exe'), ['-m', 'scripts.verify_presentation_records', '--observation', business.ids.observation, '--phase', 'withdrawn', '--improvement', business.ids.improvement], { cwd: resolve('..'), encoding: 'utf8' })
  record('MySQL after denied lifecycle transitions', 'Original retained, consent withdrawn, approved copy unpublished', output.trim())
  expect(errors).toBe(0)
})

test('REAL browser console smoke for every demo role and visible navigation', async ({ page }) => {
  let consoleErrors = 0
  page.on('console', message => { if (message.type() === 'error') consoleErrors++ })
  for (const role of ['client', 'summit', 'orchard', 'owner', 'moderator', 'admin', 'employee']) {
    await login(page, role)
    const nav = page.getByRole('navigation', { name: 'Workspace', exact: true })
    const labels = await nav.getByRole('link').allTextContents()
    for (const label of labels) { await nav.getByRole('link', { name: label, exact: true }).click(); await loaded(page) }
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  }
  expect(consoleErrors).toBe(0)
  expect(errors).toBe(0)
  expect(traffic.filter(r => r.status >= 400)).toEqual([])
  record('All seven roles: console and normal navigation requests', 'No console errors, unhandled JS exceptions or failed normal requests', `console errors=${consoleErrors}; JS exceptions=${errors}; normal HTTP failures=0`)
})
