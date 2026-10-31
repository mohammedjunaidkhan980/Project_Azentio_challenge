import { expect, test } from './demo-fixture'
import AxeBuilder from '@axe-core/playwright'

test('client can save privately, propose sharing explicitly and change preview persona', async ({ page }) => {
  await page.goto('/workspace')
  await page.getByRole('link', { name: 'New observation' }).click()
  await expect(page.getByRole('radio', { name: /Only me/ })).toBeChecked()
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused()
  await page.getByLabel('Title', { exact: true }).fill('New synthetic observation')
  await page.getByLabel('What did you observe?').fill('A synthetic scenario needs a clearer explanation of seasonality.')
  await page.getByRole('checkbox', { name: /I allow this synthetic/ }).check()
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('status')).toContainText('No shared copy was created')
  await page.getByRole('radio', { name: /Propose community sharing/ }).check()
  await page.getByRole('button', { name: 'Propose for review' }).click()
  await expect(page.getByText('Give explicit permission before proposing community sharing.')).toBeVisible()
  await page.getByRole('checkbox', { name: /I explicitly permit/ }).check()
  // Saving navigated to a fresh revision and correctly renewed processing acknowledgement.
  await page.getByRole('checkbox', { name: /I allow this synthetic/ }).check()
  await page.getByRole('button', { name: 'Propose for review' }).click()
  await expect(page.getByText('Pending review', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0)
  const privateUrl = page.url()
  await page.getByRole('combobox', { name: /Preview persona/ }).selectOption('client-b')
  await expect(page.getByRole('heading', { name: 'This preview persona cannot open this page' })).toBeVisible()
  await page.getByRole('combobox', { name: /Preview persona/ }).selectOption('client-a')
  await expect(page).toHaveURL(privateUrl)
  await expect(page.getByRole('heading', { name: 'New synthetic observation', exact: true })).toBeVisible()
})

test('client dashboard has recoverable empty and error states', async ({ page }) => {
  await page.goto('/workspace')
  await page.getByLabel('Observation preview data').selectOption('empty')
  await expect(page.getByRole('heading', { name: 'Start with an observation' })).toBeVisible()
  await page.getByLabel('Observation preview data').selectOption('error')
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Retry observations' }).click()
  await expect(page.getByText('Seasonal comparisons need a clearer explanation', { exact: true })).toBeVisible()
})

for (const route of ['/workspace', '/observations/new', '/observations/sample-returned-a']) {
  test(`client page ${route} reflows and has no detected accessibility violations`, async ({ page }) => {
    await page.goto(route)
    for (const width of [320, 360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/client-${route.replaceAll('/', '-')}.png`, fullPage: true })
  })
}
