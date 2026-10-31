import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('moderator publishes a safe copy; another client sees no private source; author withdraws', async ({ page }) => {
  await page.goto('/review')
  await expect(page.getByRole('heading', { name: 'This preview persona cannot open this page' })).toBeVisible()
  await page.getByRole('combobox', { name: /Preview persona/ }).selectOption('moderator')
  await expect(page.getByText('Private synthetic review note')).toHaveCount(0)
  await page.getByRole('link', { name: /Add context to seasonal cash-flow comparisons/ }).click()
  await expect(page.getByRole('heading', { name: 'Submitted source', exact: true })).toBeVisible()
  await expect(page.getByText(/Sample Branch 41/)).toBeVisible()
  await page.getByRole('button', { name: 'Preview publication' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Use synthetic safe-copy example' }).click()
  await page.getByLabel('Reason / feedback to contributor').fill('Removed identifying details from the synthetic source.')
  await page.getByRole('checkbox', { name: /I reviewed the proposed copy/ }).check()
  await page.getByRole('button', { name: 'Preview publication' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview publication' })).toBeFocused()
  await page.getByRole('button', { name: 'Preview publication' }).click()
  await page.getByRole('button', { name: 'Publish reviewed copy' }).click()
  await expect(page.getByRole('status').first()).toContainText('private original was not shared')
  await page.getByRole('link', { name: 'Approved learning', exact: true }).click()
  await page.getByRole('combobox', { name: /Preview persona/ }).selectOption('client-a')
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('article')).not.toContainText('Sample Branch 41')
  await expect(page.getByRole('article')).not.toContainText('Fictional Bank B')
  await page.screenshot({ path: 'test-results/approved-learning.png', fullPage: true })
  await page.getByRole('combobox', { name: /Preview persona/ }).selectOption('client-b')
  await page.getByRole('link', { name: 'Client dashboard', exact: true }).click()
  await page.getByRole('link', { name: /Add context to seasonal cash-flow comparisons/ }).click()
  await page.getByRole('button', { name: 'Withdraw sharing' }).click()
  await page.getByRole('button', { name: 'Confirm withdrawal' }).click()
  await expect(page.getByText('Withdrawn', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Approved learning', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Search approved learning' }).fill('seasonal')
  await expect(page.getByRole('heading', { name: 'No matching reviewed contributions' })).toBeVisible()
})

for (const action of ['Request changes', 'Reject proposal']) {
  test(`moderator ${action.toLowerCase()} leaves no publication`, async ({ page }) => {
    await page.goto('/review')
    await page.getByRole('combobox', { name: /Preview persona/ }).selectOption('moderator')
    await page.getByRole('link', { name: /Add context to seasonal cash-flow comparisons/ }).click()
    await page.getByRole('button', { name: action, exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('review reason')
    await page.getByLabel('Reason / feedback to contributor').fill('Please clarify this synthetic example.')
    await page.getByRole('button', { name: action, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'The review queue is clear' })).toBeVisible()
    await page.getByRole('link', { name: 'Approved learning', exact: true }).click()
    await expect(page.getByRole('article')).toHaveCount(0)
  })
}

for (const route of ['/review', '/review/sample-submitted-b', '/learning']) {
  test(`review page ${route} reflows and has no detected accessibility violations`, async ({ page }) => {
    await page.goto('/workspace')
    await page.getByRole('combobox', { name: /Preview persona/ }).selectOption('moderator')
    // Navigate within the app so the in-memory persona is preserved.
    await page.getByRole('link', { name: route === '/learning' ? 'Approved learning' : 'Moderator review', exact: true }).click()
    if (route.endsWith('sample-submitted-b')) await page.getByRole('link', { name: /Add context to seasonal cash-flow comparisons/ }).click()
    for (const width of [320, 360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/review-${route.replaceAll('/', '-')}.png`, fullPage: true })
  })
}
