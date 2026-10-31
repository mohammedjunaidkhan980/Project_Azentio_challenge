import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Browser } from '@playwright/test'

const path = process.env.AZENTIO_DEMO_CREDENTIALS
if (!path) throw new Error('Set AZENTIO_DEMO_CREDENTIALS to the private synthetic fixture file')
const fixture = JSON.parse(readFileSync(path, 'utf8'))

async function signIn(browser: Browser, role: string) {
  const page = await browser.newPage({ baseURL: 'http://127.0.0.1:5174' })
  await page.goto('/connect')
  await page.getByRole('button', { name: 'Use API mode', exact: true }).click()
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
  await other.getByRole('link', { name: 'Approved learning', exact: true }).click()
  await expect(other.getByRole('heading', { name: marker + ' approved', exact: true })).toHaveCount(0)
  await expect(other.getByRole('heading', { name: 'No approved learning available' })).toBeVisible()

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
