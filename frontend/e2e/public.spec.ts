import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('public catalogue, detail and enquiry support validation and failure recovery', async ({ page }) => {
  await page.goto('/offerings')
  await expect(page.getByRole('article')).toHaveCount(3)
  await page.getByRole('textbox', { name: 'Search offerings' }).fill('seasonal')
  await expect(page.getByRole('article')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Search offerings' }).fill('cash-flow')
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.getByRole('link', { name: /Explore offering\s*: Financial/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Financial Analysis Intelligence')
  await page.getByRole('link', { name: 'Request a demo' }).click()
  await page.getByRole('button', { name: 'Record demo enquiry' }).click()
  await expect(page.getByLabel('Your name')).toBeFocused()
  await expect(page.getByText('Enter a valid email address.')).toBeVisible()
  await page.getByLabel('Your name').fill('Alex Example')
  await page.getByLabel('Email address').fill('alex@example.com')
  await page.getByLabel('Organisation', { exact: true }).fill('Fictional Bank A')
  await page.getByRole('checkbox', { name: /I understand/ }).check()
  await page.getByText('Demo testing options', { exact: true }).click()
  await page.getByLabel('Simulate a request failure').check()
  await page.getByRole('button', { name: 'Record demo enquiry' }).click()
  await expect(page.getByRole('alert')).toContainText('simulated request failed')
  await expect(page.getByLabel('Your name')).toHaveValue('Alex Example')
  await page.getByLabel('Simulate a request failure').uncheck()
  await page.getByRole('button', { name: 'Record demo enquiry' }).click()
  await expect(page.getByRole('heading', { name: 'Preview enquiry recorded.' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('No email has been sent')
})

test('catalogue has explicit loading, empty and recoverable error states', async ({ page }) => {
  await page.goto('/offerings')
  await expect(page.getByRole('article')).toHaveCount(3)
  await page.getByLabel('Catalogue preview data').selectOption('empty')
  await expect(page.getByRole('heading', { name: 'No offerings found' })).toBeVisible()
  await page.getByLabel('Catalogue preview data').selectOption('error')
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Retry catalogue' }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
})

test('category filters combine with search and recover from no matches', async ({ page }) => {
  await page.goto('/offerings')
  await expect(page.getByRole('article')).toHaveCount(3)
  await page.getByRole('combobox', { name: 'Offering category' }).selectOption('Operations')
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('article')).toContainText('Document Intelligence')
  await page.getByRole('textbox', { name: 'Search offerings' }).fill('cash-flow')
  await expect(page.getByRole('heading', { name: 'No offerings found' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Offering category' }).selectOption('All offerings')
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('article')).toContainText('Financial Analysis Intelligence')
})

for (const route of ['/', '/offerings', '/offerings/financial-analysis', '/demo']) {
  test(`public page ${route} has no detected accessibility violations and reflows`, async ({ page }) => {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    if (route === '/') {
      await expect(page).toHaveTitle('Azentio.ai — Enterprise AI for Financial Services')
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Explore Azentio\.ai enterprise AI offerings/)
    }
    await expect(page.locator('header')).not.toContainText(/Challenge 7|Hackathon prototype/i)
    await expect(page.locator('footer')).not.toContainText(/Considered intelligence|Hackathon prototype/i)
    await expect(page.locator('header').getByRole('link', { name: 'Client workspace' })).toHaveAttribute('href', '/workspace')
    await expect(page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Client sign-in' })).toHaveAttribute('href', '/connect')
    for (const width of [320, 360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const overflow = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth).map(el => el.className).slice(0, 8) }))
      expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(width)
    }
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations).toEqual([])
    await page.screenshot({ path: `test-results/public-${route.replaceAll('/', '-') || 'home'}.png`, fullPage: true })
  })
}

test('workspace keeps sample data and simulated permission disclosures', async ({ page }) => {
  await page.goto('/workspace')
  await expect(page.getByText('Sample data · Preview workspace')).toBeVisible()
  await expect(page.getByText('Preview persona — simulated permissions')).toBeVisible()
  await expect(page.getByRole('combobox', { name: /Preview persona/ })).toBeVisible()
})
