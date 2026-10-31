import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const file = process.env.AZENTIO_DEMO_CREDENTIALS
if (!file) throw new Error('Private development credentials file required')
const f = JSON.parse(readFileSync(file, 'utf8'))

async function enterCredentials(page: Page, role: string) {
  await page.getByLabel('Work email', { exact: true }).fill(f.users[role].email)
  await page.locator('input[name="password"]').evaluate((input, password) => { (input as HTMLInputElement).value = password }, f.users[role].password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

for (const [role, destination] of [['client_a', '/workspace'], ['admin', '/admin/users'], ['employee', '/employee'], ['moderator', '/review'], ['owner', '/improvements']]) {
  test(`REAL auth routing: ${role} reaches its authorised dashboard`, async ({ page }) => {
    await page.goto('/workspace')
    await expect(page).toHaveURL(/\/connect\?returnTo=/)
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.locator('main')).not.toContainText(/API workspace|local role grants|Preview persona|Configured backend/)
    const login = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST')
    const profile = page.waitForResponse(r => r.url().endsWith('/auth/me'))
    await enterCredentials(page, role)
    const auth = await login
    expect(auth.status()).toBe(200)
    const me = await profile
    expect(me.status()).toBe(200)
    expect((await me.json()).data.id).toBe(f.users[role].id)
    await expect(page).toHaveURL(new RegExp(destination.replaceAll('/', '\\/') + '$'))
    await expect(page.getByRole('combobox', { name: 'Active organisation', exact: true })).toHaveValue(f.users[role].organisation_id)
    if (role === 'client_a') {
      const tokens = (await auth.json()).data
      const refresh = await page.request.post('/api/v1/auth/refresh', { data: { refresh_token: tokens.refresh_token } })
      expect(refresh.status()).toBe(200)
      const refreshed = (await refresh.json()).data
      expect((await page.request.get('/api/v1/auth/me', { headers: { Authorization: 'Bearer ' + refreshed.access_token } })).status()).toBe(200)
      await page.reload()
      await expect(page).toHaveURL(/\/connect\?returnTo=%2Fworkspace/)
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
      await enterCredentials(page, role)
      await expect(page).toHaveURL(/\/workspace$/)
    }
    if (role === 'employee') {
      await page.getByRole('link', { name: 'Account', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Signed-in profile' })).toBeVisible()
    }
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/connect/)
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    expect(await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].some(key => /token|password|credential/i.test(key)))).toBe(false)
  })
}

test('REAL auth routing: safe deep link, reveal password and denied role', async ({ page }) => {
  await page.goto('/observations/new?source=signin#details')
  await expect(page).toHaveURL(/\/connect\?returnTo=/)
  await page.getByRole('button', { name: 'Show password', exact: true }).click()
  await expect(page.locator('#login-password')).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password', exact: true }).click()
  const loginResponse = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST')
  await enterCredentials(page, 'client_a')
  const token = (await (await loginResponse).json()).data.access_token
  expect((await page.request.get('/api/v1/admin/users', { headers: { Authorization: 'Bearer ' + token } })).status()).toBe(403)
  await expect(page).toHaveURL(/\/observations\/new\?source=signin#details$/)
  await page.evaluate(() => { history.pushState({}, '', '/admin/users'); dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.goto('/connect?returnTo=https%3A%2F%2Foutside.example')
  await enterCredentials(page, 'client_a')
  await expect(page).toHaveURL(/\/workspace$/)
})

test('REAL auth routing: server memberships drive choice and no-membership restriction', async ({ page }) => {
  const admin = await page.request.post('/api/v1/auth/login', { data: { email: f.users.admin.email, password: f.users.admin.password } })
  const headers = { Authorization: 'Bearer ' + (await admin.json()).data.access_token }
  const base = '/api/v1/admin/users/' + f.users.peer_a.id
  const original = (await (await page.request.get(base, { headers })).json()).data
  const b = original.memberships.find((m: { organisation_id: string }) => m.organisation_id === f.organisations.b)
  if (!b) throw new Error('Existing synthetic B membership fixture required')
  try {
    expect((await page.request.patch(base + '/memberships/' + b.id, { headers, data: { role: 'product_owner', is_active: true } })).status()).toBe(200)
    await page.goto('/workspace')
    await enterCredentials(page, 'peer_a')
    await expect(page.getByRole('heading', { name: 'Choose your workspace' })).toBeVisible()
    await page.setViewportSize({ width: 320, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    await page.getByLabel('Organisation and role', { exact: true }).selectOption(f.organisations.b)
    await page.getByRole('button', { name: 'Continue to workspace' }).click()
    await expect(page).toHaveURL(/\/improvements$/)
    await expect(page.getByRole('combobox', { name: 'Active organisation', exact: true })).toHaveValue(f.organisations.b)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    await page.getByRole('combobox', { name: 'Active organisation', exact: true }).selectOption(f.organisations.a)
    await expect(page).toHaveURL(/\/workspace$/)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    for (const m of original.memberships) expect((await page.request.patch(base + '/memberships/' + m.id, { headers, data: { is_active: false } })).status()).toBe(200)
    await enterCredentials(page, 'peer_a')
    await expect(page.getByRole('heading', { name: 'Workspace access required' })).toBeVisible()
    await expect(page).toHaveURL(/\/connect/)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    expect((await page.request.patch(base + '/status', { headers, data: { is_active: false } })).status()).toBe(200)
    await enterCredentials(page, 'peer_a')
    await expect(page.getByRole('alert')).toContainText('The email or password is incorrect')
  } finally {
    expect((await page.request.patch(base + '/status', { headers, data: { is_active: original.is_active } })).status()).toBe(200)
    for (const m of original.memberships) expect((await page.request.patch(base + '/memberships/' + m.id, { headers, data: { role: m.role, is_active: m.is_active } })).status()).toBe(200)
  }
})
