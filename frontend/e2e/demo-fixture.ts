import { test as base, expect } from '@playwright/test'

// Existing fixture-only demonstrations opt in explicitly; customers default to API.
export const test = base.extend({
  page: async ({ page }, runFixture) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('azentio-data-mode')) sessionStorage.setItem('azentio-data-mode', 'demo')
    })
    await runFixture(page)
  },
})
export { expect }
