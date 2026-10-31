import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Browser } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const path = process.env.AZENTIO_DEMO_CREDENTIALS
if (!path) throw new Error('Set AZENTIO_DEMO_CREDENTIALS to the private synthetic fixture file')
const fixture = JSON.parse(readFileSync(path, 'utf8'))

test('REAL login: responsive corporate presentation, invalid credentials and offline recovery', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' })
  const page = await context.newPage()
  await page.goto('/connect')
  await expect(page.getByRole('heading', { name: 'Welcome back', level: 1 })).toBeVisible()
  await expect(page.getByText("Sign in to access your organisation's workspace.")).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/API CONNECTION|Configured API|VITE_API_BASE_URL|synthetic|fixture|prototype|localhost|127\.0\.0\.1/)
  await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    const heading = await page.locator('h1').boundingBox()
    expect(heading!.x).toBeGreaterThanOrEqual(0)
    expect(heading!.x + heading!.width).toBeLessThanOrEqual(width)
    expect(heading!.height).toBeLessThan(100)
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
    await page.screenshot({ path: `.local/login-${width}.png`, fullPage: true })
  }
  await page.getByLabel('Email address', { exact: true }).fill(fixture.users.client_a.email)
  await page.getByLabel('Password', { exact: true }).fill('deliberately-incorrect-synthetic-input')
  const rejected = page.waitForResponse(r => r.url().endsWith('/auth/login'))
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  expect((await rejected).status()).toBe(401)
  await expect(page.getByRole('alert')).toContainText('The email or password is incorrect')
  await expect(page.getByRole('heading', { name: 'Signed-in profile' })).toHaveCount(0)
  await page.context().setOffline(true)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Sign-in is temporarily unavailable')
  await expect(page.getByRole('heading', { name: 'Signed-in profile' })).toHaveCount(0)
  await page.context().setOffline(false)
  await page.locator('input[name="password"]').evaluate((input, password) => {
    (input as HTMLInputElement).value = password
  }, fixture.users.client_a.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Signed-in profile' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.context().close()
})

async function signIn(browser: Browser, role: string) {
  const page = await browser.newPage({ baseURL: 'http://127.0.0.1:5174' })
  await page.goto('/connect')
  await page.getByLabel('Email address', { exact: true }).fill(fixture.users[role].email)
  // No traces, videos, screenshots or credential-bearing fill action logs.
  await page.locator('input[name="password"]').evaluate((input, password) => {
    (input as HTMLInputElement).value = password
  }, fixture.users[role].password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Signed-in profile' })).toBeVisible()
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  return page
}

test('REAL themes: safe evidence links and approved-only search', async ({ browser }) => {
  test.skip(!fixture.last_theme_journey?.suffix, 'Run check_learning_themes before this dedicated browser test')
  const page = await signIn(browser, 'client_a')
  await page.getByRole('link', { name: 'Learning themes', exact: true }).click()
  const card = page.locator('article').filter({ hasText: fixture.last_theme_journey.product_id })
  await expect(card.getByRole('heading', { name: 'Seasonality context' })).toBeVisible()
  await expect(card.getByText('3 contributing organisations', { exact: true })).toBeVisible()
  await expect(card.getByText(/not market prevalence/)).toBeVisible()
  await expect(card.getByRole('link')).toHaveCount(5)
  await card.getByRole('link').first().click()
  await expect(page.getByRole('heading', { name: 'Seasonality ' + fixture.last_theme_journey.suffix })).toBeVisible()
  await expect(page.locator('main')).not.toContainText('PRIVATE-THEME-SOURCE')
  await page.getByRole('link', { name: 'Approved learning', exact: true }).click()
  await page.getByLabel('Search approved learning').fill(fixture.last_theme_journey.suffix)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Seasonality ' + fixture.last_theme_journey.suffix })).toHaveCount(5)
  await page.getByLabel('Search approved learning').fill('PRIVATE-THEME-SOURCE')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No approved learning available' })).toBeVisible()
  await page.context().close()
})

test('REAL HTTP/MySQL: browser author → consent → moderation → entitled learning → improvement → withdrawal', async ({ browser }) => {
  const author = await signIn(browser, 'client_a')
  const marker = 'SYNTHETIC Browser ' + Date.now()
  await author.getByRole('link', { name: 'New observation', exact: true }).click()
  await author.getByLabel('Title', { exact: true }).fill(marker)
  await author.getByLabel('Observation (10–10000 characters)').fill('PRIVATE-SOURCE browser synthetic original, organisation only.')
  await author.getByLabel('Product ID').fill(fixture.product_id)
  await author.getByRole('checkbox').check()
  const created = author.waitForResponse(r => r.url().endsWith('/api/v1/observations') && r.request().method() === 'POST')
  await author.getByRole('button', { name: 'Create organisation observation', exact: true }).click()
  const createResponse = await created
  expect(createResponse.status()).toBe(201)
  const obs = (await createResponse.json()).data
  expect(obs.consent_status).toBe('not_granted')
  await author.locator('article').filter({ has: author.getByRole('heading', { name: marker, exact: true }) }).getByRole('link').click()
  await author.getByRole('checkbox').check()
  await author.getByRole('button', { name: 'Grant sharing consent', exact: true }).click()
  await expect(author.getByText('Sharing consent: granted', { exact: true })).toBeVisible()

  const moderator = await signIn(browser, 'moderator')
  await moderator.getByRole('link', { name: 'Moderator review', exact: true }).click()
  await moderator.locator('article').filter({ has: moderator.getByRole('heading', { name: marker, exact: true }) }).getByRole('link').click()
  await moderator.getByLabel('Decision reason').fill('Synthetic privacy review')
  await moderator.getByLabel('Reviewed title (required for approval)').fill(marker + ' approved')
  await moderator.getByLabel('Reviewed body (required for approval)').fill('Reviewed fictional calculation insight. No private original.')
  await moderator.locator('form').filter({ has: moderator.getByRole('button', { name: 'Record moderation decision', exact: true }) }).getByRole('checkbox').check()
  await moderator.getByRole('button', { name: 'Record moderation decision', exact: true }).click()
  await expect(moderator.getByRole('heading', { name: 'Approval acknowledged.' })).toBeVisible()
  await moderator.locator('form').filter({ has: moderator.getByRole('button', { name: 'Publish approved copy', exact: true }) }).getByRole('checkbox').check()
  const publication = moderator.waitForResponse(r => r.url().endsWith('/publish') && r.request().method() === 'POST')
  await moderator.getByRole('button', { name: 'Publish approved copy', exact: true }).click()
  const published = await publication
  expect(published.status()).toBe(200)
  const shared = (await published.json()).data

  const reader = await signIn(browser, 'client_b')
  await reader.getByRole('link', { name: 'Approved learning', exact: true }).click()
  await expect(reader.getByRole('heading', { name: marker + ' approved', exact: true })).toBeVisible()
  await expect(reader.getByText('PRIVATE-SOURCE', { exact: false })).toHaveCount(0)
  const other = await signIn(browser, 'client_c')
  const thirdFeed = other.waitForResponse(r => r.url().includes('/api/v1/shared-learning?') && r.request().method() === 'GET')
  await other.getByRole('link', { name: 'Approved learning', exact: true }).click()
  const thirdEntries = (await (await thirdFeed).json()).data as { id: string }[]
  expect(thirdEntries.some(entry => entry.id === shared.id)).toBe(false)
  await expect(other.getByRole('heading', { name: marker + ' approved', exact: true })).toHaveCount(0)

  const owner = await signIn(browser, 'owner')
  await owner.getByRole('link', { name: 'Product improvements', exact: true }).click()
  await owner.getByLabel('Improvement title').fill(marker + ' improvement')
  await owner.getByLabel('Problem and proposed outcome').fill('Improve the synthetic calculation using this reviewed evidence.')
  await owner.getByLabel('Product UUID').fill(fixture.product_id)
  await owner.getByLabel('Approved shared-entry UUIDs (comma-separated)').fill(shared.id)
  await owner.getByRole('checkbox').check()
  const ideaRequest = owner.waitForResponse(r => r.url().endsWith('/api/v1/product-improvements') && r.request().method() === 'POST')
  await owner.getByRole('button', { name: 'Create evidence-linked improvement', exact: true }).click()
  const ideaResponse = await ideaRequest
  expect(ideaResponse.status()).toBe(201)
  const idea = (await ideaResponse.json()).data
  const card = owner.locator('article').filter({ has: owner.getByRole('heading', { name: marker + ' improvement', exact: true }) })
  await card.getByLabel('Next status').selectOption('under_review')
  await card.getByLabel('Status reason').fill('Synthetic owner review')
  await card.getByRole('button', { name: 'Update improvement status', exact: true }).click()
  await expect(card.getByText('under review', { exact: true })).toBeVisible()
  await author.getByRole('link', { name: 'Product improvements', exact: true }).click()
  await expect(author.getByRole('heading', { name: marker + ' improvement', exact: true })).toBeVisible()
  await author.getByRole('link', { name: 'Client dashboard', exact: true }).click()
  await author.locator('article').filter({ has: author.getByRole('heading', { name: marker, exact: true }) }).getByRole('link').click()
  await author.getByRole('checkbox').check()
  const start = Date.now()
  await author.getByRole('button', { name: 'Withdraw sharing consent', exact: true }).click()
  await expect(author.getByText('Sharing consent: withdrawn', { exact: true })).toBeVisible()
  await reader.getByRole('link', { name: 'Client dashboard', exact: true }).click()
  await reader.getByRole('link', { name: 'Approved learning', exact: true }).click()
  await expect(reader.getByRole('heading', { name: marker + ' approved', exact: true })).toHaveCount(0)
  expect(Date.now() - start).toBeLessThan(60000)
  await owner.getByRole('link', { name: 'Connection & profile', exact: true }).click()
  await owner.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await owner.getByRole('link', { name: 'Product improvements', exact: true }).click()
  await expect(owner.locator('article').filter({ has: owner.getByRole('heading', { name: marker + ' improvement', exact: true }) }).getByText('Supporting evidence unavailable or withdrawn')).toBeVisible()
  fixture.last_browser_journey = { observation_id: obs.id, shared_id: shared.id, improvement_id: idea.id }
  writeFileSync(path!, JSON.stringify(fixture, null, 2))
  for (const page of [author, moderator, reader, other, owner]) await page.context().close()
})
