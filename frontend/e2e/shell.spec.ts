import { expect, test } from './demo-fixture'
import AxeBuilder from '@axe-core/playwright'

test('shell is navigable and has no detected serious accessibility violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations).toEqual([])
})

for (const width of [320, 360, 768, 1440]) {
  test(`shell navigation and reflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    if (width <= 640) {
      await page.getByRole('button', { name: 'Open navigation' }).click()
      await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true')
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'AI offerings', exact: true }).focus()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused()
      await page.getByRole('button', { name: 'Open navigation' }).click()
    }
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'AI offerings', exact: true }).click()
    await expect(page).toHaveURL(/\/offerings$/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
