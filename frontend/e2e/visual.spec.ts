import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

for (const route of ['/', '/offerings', '/demo', '/workspace', '/observations/new']) {
  test(`mobile visual and accessibility evidence for ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    if (route === '/offerings') await expect(page.getByRole('article')).toHaveCount(3)
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
    await page.screenshot({ path: `test-results/mobile-${route.replaceAll('/', '-') || 'home'}.png`, fullPage: true })
    await page.setViewportSize({ width: 1440, height: 900 })
    // CSS 200% magnification is supplementary. It is not a screen-reader or browser text-zoom certification.
    await page.evaluate(() => { document.body.style.zoom = '2' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
  })
}

test('mobile review source/editor layout and tablet enquiry remain readable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/review')
  await page.getByRole('combobox', { name: /Preview persona/ }).selectOption('moderator')
  await page.getByRole('link', { name: /Add context to seasonal/ }).click()
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
  await page.screenshot({ path: 'test-results/mobile-review-editor.png', fullPage: true })
  await page.goto('/demo')
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.screenshot({ path: 'test-results/tablet-enquiry.png', fullPage: true })
})

test('mobile validation and loading-failure states reflow and remain accessible', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Record demo enquiry' }).click()
  await expect(page.getByText('Enter a valid email address.')).toBeVisible()
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  await page.screenshot({ path: 'test-results/mobile-validation.png', fullPage: true })
  await page.goto('/offerings')
  await page.getByLabel('Catalogue preview data').selectOption('error')
  await expect(page.getByRole('alert')).toBeVisible()
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  await page.getByRole('button', { name: 'Retry catalogue' }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
})
