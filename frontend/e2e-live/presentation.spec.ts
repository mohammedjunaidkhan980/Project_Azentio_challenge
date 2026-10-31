import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Actual UI rehearsal: no request interception, API seeding or credential recording.
test.use({ actionTimeout: 10000, navigationTimeout: 15000 })

test('REAL presentation support-client membership readiness via Admin UI', async ({ browser }) => {
  test.skip(!process.env.AZENTIO_PRESENTATION_REPAIR, 'Explicit synthetic fixture repair only')
  const fixture = JSON.parse(readFileSync(process.env.AZENTIO_PRESENTATION_CREDENTIALS!, 'utf8'))
  const page = await browser.newPage({ baseURL: 'http://127.0.0.1:5174' })
  await page.goto('/connect')
  await page.getByLabel('Work email', { exact: true }).fill(fixture.users.admin.email)
  await page.locator('input[name="password"]').evaluate((el, password) => { (el as HTMLInputElement).value = password }, fixture.users.admin.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.locator(`a[href="/admin/users/${fixture.users.summit.id}"]`).click()
  const region = page.getByRole('region', { name: 'Membership at Summit Finance (Demo)' })
  await region.getByLabel('Membership role').selectOption('client')
  await region.getByLabel('Membership state').selectOption('true')
  const form = region.getByRole('button', { name: 'Save membership', exact: true }).locator('..')
  await form.getByRole('checkbox').check()
  const save = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/memberships/'))
  await form.getByRole('button').click(); expect((await save).status()).toBe(200)
  await expect(region.getByText('client · Active', { exact: true })).toBeVisible()
  const folder = resolve('.local/presentation-verification/account-repair')
  mkdirSync(folder, { recursive: true })
  await page.screenshot({ path: join(folder, 'summit-membership-restored.png'), fullPage: true })
  await page.context().close()
})

test('REAL presentation rehearsal with screenshots and direct MySQL evidence', async ({ browser }) => {
  test.setTimeout(240000)
  const file = process.env.AZENTIO_PRESENTATION_CREDENTIALS
  if (!file) throw new Error('Private synthetic presentation manifest required')
  const fixture = JSON.parse(readFileSync(file, 'utf8'))
  const resume = process.env.AZENTIO_PRESENTATION_RESUME ? JSON.parse(readFileSync(process.env.AZENTIO_PRESENTATION_RESUME, 'utf8')) : null
  const folder = resume ? dirname(process.env.AZENTIO_PRESENTATION_RESUME!) : resolve('.local/presentation-verification', new Date().toISOString().replaceAll(':', '-'))
  mkdirSync(folder, { recursive: true })
  const report: { name: string; status: string; url: string; screenshot: string; detail: string }[] = resume ? resume.report.filter((r: { status: string }) => r.status === 'PASS') : []
  const http: { role: string; path: string; method: string; status: number }[] = []
  const pages: Page[] = [], ids = resume?.ids ?? { observation: '', shared: '', improvement: '' }
  const business = process.env.AZENTIO_QA_BUSINESS_CASE === 'document-verification'
  const description = business ? 'FICTIONAL PRIVATE: Fictional Harbour Bank feedback. Problem description: Our loan operations team is spending too much time manually verifying documents. Each application requires repeated checks, increasing processing time and creating delays for customers. Business impact: Loan processing is delayed, employees spend additional time on verification, and customers experience longer waiting periods. Suggested improvement: Introduce automated document validation with human review for exceptional cases. Question: Can Azentio introduce a document verification workflow that reduces repetitive manual checks while maintaining human approval for exceptions?' : 'FICTIONAL PRIVATE: Harbour branch H-17; fictitious analyst Morgan Lee; sample portfolio variance 18%. Compare seasonal quarters before escalating. All details are invented for this demonstration.'
  const stamp = resume?.created ?? new Date().toISOString(), title = resume?.title ?? (business ? 'Manual Loan Verification Delays' : 'Seasonal portfolio comparison — presentation ' + stamp)
  const approvedTitle = resume?.approvedTitle ?? (business ? 'Reducing Manual Document Verification Delays' : 'Seasonal portfolio comparison: reviewed insight ' + stamp)
  const improvementTitle = resume?.improvementTitle ?? (business ? 'Automated Document Verification Workflow' : 'Add seasonal comparison guidance — presentation ' + stamp)
  let current = 'Client sign-in'
  async function capture(page: Page, name: string, detail = '') {
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
    const screenshot = join(folder, `${String(report.length + 1).padStart(2, '0')}.png`)
    await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' })
    report.push({ name, status: 'PASS', url: page.url(), screenshot, detail })
  }
  async function signIn(role: string, path = '/connect') {
    const page = await browser.newPage({ baseURL: 'http://127.0.0.1:5174', viewport: { width: 1440, height: 1000 } })
    pages.push(page)
    page.on('response', response => { const path = new URL(response.url()).pathname; if (path.startsWith('/api/v1/')) http.push({ role, path, method: response.request().method(), status: response.status() }) })
    page.on('pageerror', () => { report.push({ name: 'Browser JavaScript error', status: 'FAIL', url: page.url(), screenshot: '', detail: 'Unexpected JavaScript error; inspect locally.' }) })
    await page.goto(path)
    await page.getByLabel('Work email', { exact: true }).fill(fixture.users[role].email)
    await page.locator('input[name="password"]').evaluate((el, password) => { (el as HTMLInputElement).value = password }, fixture.users[role].password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('navigation', { name: 'Workspace', exact: true })).toBeVisible()
    return page
  }
  function database(phase: string) {
    const args = ['-m', 'scripts.verify_presentation_records', '--observation', ids.observation, '--phase', phase]
    if (['improved', 'withdrawn'].includes(phase)) args.push('--improvement', ids.improvement)
    const evidence = execFileSync(resolve('../.venv/Scripts/python.exe'), args, { cwd: resolve('..'), encoding: 'utf8' }).trim()
    report.push({ name: 'Direct MySQL: ' + phase, status: 'PASS', url: '', screenshot: '', detail: evidence })
  }
  async function search(page: Page, query: string) {
    await page.getByRole('link', { name: 'Approved learning', exact: true }).click()
    await page.getByLabel('Search approved learning').fill(query)
    const response = page.waitForResponse(r => r.url().includes('/api/v1/shared-learning?') && new URL(r.url()).searchParams.get('q') === query)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    expect((await response).status()).toBe(200)
  }
  try {
    const client = await signIn('client', resume ? '/observations/' + ids.observation : '/connect')
    if (!resume) {
    await expect(client.getByRole('heading', { name: 'Your organisation’s observations.' })).toBeVisible()
    await capture(client, '1 Client sign-in', fixture.users.client.email)
    if (business) {
      await client.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'AI offerings', exact: true }).click()
      await client.getByRole('link', { name: 'Explore offering: Financial Analysis Intelligence', exact: true }).click()
      await expect(client.getByRole('heading', { name: 'Financial Analysis Intelligence', exact: true })).toBeVisible()
      await capture(client, 'Selected an existing entitled catalogue offering')
      await client.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Client workspace', exact: true }).click()
    }
    current = 'Create observation'
    await client.getByRole('link', { name: 'New observation', exact: true }).click()
    await client.getByLabel('Title', { exact: true }).fill(title)
    await client.getByLabel('Observation (10–10000 characters)').fill(description)
    await client.getByLabel('Product ID').fill(fixture.product_id)
    await client.getByLabel('Category').fill(business ? 'Document verification' : 'Seasonality')
    await client.getByRole('checkbox').check()
    const creation = client.waitForResponse(r => r.url().endsWith('/api/v1/observations') && r.request().method() === 'POST')
    await client.getByRole('button', { name: 'Create organisation observation', exact: true }).click()
    const created = await creation; expect(created.status()).toBe(201)
    ids.observation = (await created.json()).data.id
    await client.locator(`a[href="/observations/${ids.observation}"]`).click()
    await expect(client.getByText('Sharing consent: not_granted', { exact: true })).toBeVisible()
    await capture(client, '2 Observation submitted without sharing consent', 'HTTP201; original is organisation-visible, not an author-private draft.')
    database('created')
    current = 'Grant consent'
    await client.getByRole('checkbox').check()
    await client.getByRole('button', { name: 'Grant sharing consent', exact: true }).click()
    await expect(client.getByText('Sharing consent: granted', { exact: true })).toBeVisible()
    await capture(client, '4 Explicit sharing consent'); database('granted')
    current = 'Moderator review and publication'
    const moderator = await signIn('moderator')
    await moderator.locator(`a[href="/review/${ids.observation}"]`).click()
    await expect(moderator.getByText(/FICTIONAL PRIVATE:/)).toBeVisible()
    await moderator.getByLabel('Decision reason').fill('Fictional privacy review: removed branch code, organisation attribution, analyst identity and exact private variance.')
    await moderator.getByLabel('Reviewed title (required for approval)').fill(approvedTitle)
    await moderator.getByLabel('Reviewed body (required for approval)').fill(business ? 'Financial institutions can experience operational delays when document verification involves repetitive manual checks. Automated document validation with human review for exceptions may help improve processing efficiency.' : 'A financial-services team found that quarter-on-quarter portfolio changes need seasonal context before escalation. Compare equivalent reporting periods and explain material differences before drawing conclusions. This is a fictional demonstration insight.')
    await capture(moderator, '5–6 Moderator reviews and explicitly redacts the original')
    const review = moderator.getByRole('button', { name: 'Record moderation decision', exact: true }).locator('..')
    await review.getByRole('checkbox').check(); await review.getByRole('button').click()
    await expect(moderator.getByRole('heading', { name: 'Approval acknowledged.' })).toBeVisible()
    const publish = moderator.getByRole('button', { name: 'Publish approved copy', exact: true }).locator('..')
    await publish.getByRole('checkbox').check()
    const publication = moderator.waitForResponse(r => r.url().endsWith('/publish') && r.request().method() === 'POST')
    await publish.getByRole('button').click(); const published = await publication; expect(published.status()).toBe(200)
    ids.shared = (await published.json()).data.id
    await capture(moderator, '6 Approved copy published', 'Approval and publication are separate confirmed UI actions.'); database('published')
    } else { database('published') }
    current = 'Authorised second client and private-original denial'
    const reader = await signIn('summit')
    if (business) {
      for (const query of ['Document verification', 'Loan processing', 'Manual checks', 'FICTIONAL PRIVATE']) {
        await search(reader, query)
        const expected = !['Loan processing', 'FICTIONAL PRIVATE'].includes(query)
        if (expected) await expect(reader.getByRole('heading', { name: approvedTitle, exact: true })).toBeVisible()
        else await expect(reader.getByRole('heading', { name: approvedTitle, exact: true })).toHaveCount(0)
        await capture(reader, 'Business search: ' + query, expected ? 'Approved matching insight visible.' : 'No exact approved-text match; private text and semantic inference are not returned.')
      }
    }
    await search(reader, approvedTitle)
    await reader.getByRole('link', { name: 'View approved contribution', exact: true }).click()
    await expect(reader).toHaveURL(new RegExp('/learning/' + ids.shared + '$'))
    await expect(reader.getByRole('heading', { name: approvedTitle, exact: true })).toBeVisible()
    await expect(reader.locator('main')).not.toContainText(/FICTIONAL PRIVATE|H-17|Morgan Lee/)
    await capture(reader, '7–8 Different authorised client sees only the reviewed copy', fixture.users.summit.email)
    const denied = await signIn('summit', '/observations/' + ids.observation)
    await expect(denied.getByRole('alert')).toBeVisible()
    expect(http.some(r => r.role === 'summit' && r.path === '/api/v1/observations/' + ids.observation && r.status === 404)).toBe(true)
    await expect(denied.locator('main')).not.toContainText(/FICTIONAL PRIVATE|H-17|Morgan Lee/)
    await capture(denied, '8 Original observation is inaccessible across tenants', 'Actual React detail request denied; private source absent.')
    current = 'Product owner improvement'
    const owner = await signIn('owner')
    await owner.getByLabel('Improvement title').fill(improvementTitle)
    await owner.getByLabel('Problem and proposed outcome').fill(business ? 'Explore automated document validation to reduce repetitive verification work while retaining human review for exceptions. Business objective: Improve the efficiency of the loan application review process.' : 'Provide an equivalent-period comparison option and clear seasonal context in portfolio review guidance, supported only by the approved insight.')
    await owner.getByLabel('Product UUID').fill(fixture.product_id)
    await owner.getByLabel('Approved shared-entry UUIDs (comma-separated)').fill(ids.shared)
    await owner.getByRole('checkbox').check()
    const improvement = owner.waitForResponse(r => r.url().endsWith('/api/v1/product-improvements') && r.request().method() === 'POST')
    await owner.getByRole('button', { name: 'Create evidence-linked improvement', exact: true }).click()
    const idea = await improvement; expect(idea.status()).toBe(201); ids.improvement = (await idea.json()).data.id
    const card = owner.locator('article').filter({ has: owner.getByRole('heading', { name: improvementTitle, exact: true }) })
    await expect(card.getByText('Supporting evidence available', { exact: true })).toBeVisible()
    await card.getByLabel('Next status').selectOption('under_review')
    await card.getByLabel('Status reason').fill('Fictional owner review scheduled for the seasonal comparison enhancement.')
    await card.getByRole('button', { name: 'Update improvement status' }).click()
    await expect(card.getByText('under review', { exact: true })).toBeVisible()
    await capture(owner, '9–10 Owner creates evidence-linked improvement and updates status'); database('improved')
    await client.getByRole('link', { name: 'Product improvements', exact: true }).click()
    await expect(client.getByRole('heading', { name: improvementTitle, exact: true })).toBeVisible()
    await capture(client, '10 Client sees the improvement status')
    current = 'Consent withdrawal and access invalidation'
    await client.getByRole('link', { name: 'Client dashboard', exact: true }).click()
    await client.locator(`a[href="/observations/${ids.observation}"]`).click()
    await client.getByRole('checkbox').check(); const start = Date.now()
    await client.getByRole('button', { name: 'Withdraw sharing consent', exact: true }).click()
    await expect(client.getByText('Sharing consent: withdrawn', { exact: true })).toBeVisible()
    await capture(client, '11 Author withdraws consent')
    await search(reader, approvedTitle)
    await expect(reader.getByRole('heading', { name: 'No approved learning available' })).toBeVisible()
    await capture(reader, '11 Refreshed learning feed removes the withdrawn copy')
    const withdrawn = await signIn('summit', '/learning/' + ids.shared)
    await expect(withdrawn.getByRole('alert')).toBeVisible()
    expect(http.some(r => r.role === 'summit' && r.path === '/api/v1/shared-learning/' + ids.shared && r.status === 404)).toBe(true)
    await expect(withdrawn.getByRole('heading', { name: approvedTitle, exact: true })).toHaveCount(0)
    const elapsed = Date.now() - start; expect(elapsed).toBeLessThan(60000)
    await capture(withdrawn, '11 Previously shared direct URL is inaccessible', `Fresh UI requests denied within ${elapsed}ms of withdrawal; already viewed copies cannot be recalled.`)
    await owner.getByRole('link', { name: 'Account', exact: true }).click()
    await owner.getByRole('link', { name: 'Open workspace', exact: true }).click()
    await expect(card.getByText('Supporting evidence unavailable or withdrawn')).toBeVisible()
    await capture(owner, '11 Improvement preserves status but marks withdrawn evidence unavailable'); database('withdrawn')
    current = 'Admin Manage User'
    const admin = await signIn('admin')
    await admin.locator(`a[href="/admin/users/${fixture.users.client.id}"]`).click()
    await expect(admin.getByRole('heading', { level: 1, name: 'Harbour Bank Reviewer (Demo)' })).toBeVisible()
    expect((await admin.getByRole('heading', { level: 1 }).boundingBox())!.y).toBeLessThan(500)
    await expect(admin.getByRole('button', { name: 'Save account status' })).toBeVisible()
    await expect(admin.getByRole('button', { name: 'Save product access' })).toBeVisible()
    await capture(admin, '12 Admin Manage User opens the correct functional detail page')
    current = 'Preloaded backup demo'
    const backup = await signIn('summit', '/learning/' + fixture.scenario.approved_entries[0])
    await expect(backup.locator('article.learning-card')).toBeVisible()
    await expect(backup.locator('main')).not.toContainText(/FICTIONAL PRIVATE|H-17|Morgan Lee/)
    await capture(backup, 'Backup: existing preloaded approved learning remains accessible')
    await owner.getByRole('link', { name: 'Learning themes', exact: true }).click()
    await expect(owner.getByRole('heading', { name: 'Seasonality context', exact: true })).toBeVisible()
    await capture(owner, 'Backup: preloaded three-organisation seasonality theme')
    await owner.getByRole('link', { name: 'Product improvements', exact: true }).click()
    const preloaded = owner.locator('article').filter({ hasText: 'seasonality' })
    await expect(preloaded.first()).toBeVisible()
    await capture(owner, 'Backup: preloaded improvement workspace')
    const sourceBackup = await signIn('client', '/observations/' + fixture.scenario.organisation_only_observation)
    await expect(sourceBackup.getByText('Sharing consent: not_granted', { exact: true })).toBeVisible()
    await capture(sourceBackup, 'Backup: preloaded organisation-only observation')
    const pendingBackup = await signIn('moderator', '/review/' + fixture.scenario.pending_observation)
    await expect(pendingBackup.getByRole('button', { name: 'Record moderation decision', exact: true })).toBeVisible()
    await capture(pendingBackup, 'Backup: preloaded consented observation ready for moderator review')
    for (const entry of fixture.scenario.approved_entries.slice(1)) {
      const publishedBackup = await signIn('summit', '/learning/' + entry)
      await expect(publishedBackup.locator('article.learning-card')).toBeVisible()
      await capture(publishedBackup, 'Backup: additional preloaded approved contribution')
    }
    expect(report.filter(r => r.status === 'FAIL')).toEqual([])
  } catch (error) {
    for (const [i, page] of pages.entries()) {
      if (page.isClosed()) continue
      await page.locator('input[type="password"]').evaluateAll(inputs => inputs.forEach(input => { (input as HTMLInputElement).value = '' })).catch(() => {})
      await page.screenshot({ path: join(folder, `failure-${i}.png`), fullPage: true }).catch(() => {})
    }
    report.push({ name: current, status: 'FAIL', url: '', screenshot: 'failure-*.png', detail: (error as Error).message.slice(0, 400) })
    throw error
  } finally {
    writeFileSync(join(folder, 'results.json'), JSON.stringify({ created: stamp, title, approvedTitle, improvementTitle, ids, accounts: Object.fromEntries(Object.entries(fixture.users).map(([role, user]) => [role, (user as { email: string }).email])), preloaded: fixture.scenario, product_id: fixture.product_id, http, report }, null, 2))
    console.log('Local password-free presentation evidence:', folder)
    for (const page of pages) await page.context().close()
  }
})
