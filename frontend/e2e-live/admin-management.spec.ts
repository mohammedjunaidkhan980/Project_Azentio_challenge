import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { APIRequestContext, Locator, Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Real opt-in development accounts only. No route interception or stored tokens.
const file = process.env.AZENTIO_DEMO_CREDENTIALS
if (!file) throw new Error('Private development credentials file required')
const f = JSON.parse(readFileSync(file, 'utf8'))
async function login(api: APIRequestContext, role: string) {
  const response = await api.post('/api/v1/auth/login', { data: { email: f.users[role].email, password: f.users[role].password } })
  expect(response.status()).toBe(200)
  return { Authorization: 'Bearer ' + (await response.json()).data.access_token }
}
async function signIn(page: Page, role: string, path = '/admin/users') {
  await page.goto(path)
  await page.getByLabel('Work email', { exact: true }).fill(f.users[role].email)
  await page.locator('input[name="password"]').evaluate((el, password) => { (el as HTMLInputElement).value = password }, f.users[role].password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}
async function save(page: Page, form: Locator, label: string, path: string, method: string, status = 200) {
  await form.getByRole('checkbox').check()
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1' + path && r.request().method() === method)
  await form.getByRole('button', { name: label, exact: true }).click()
  expect((await response).status()).toBe(status)
}
test('REAL admin: visible routed detail, membership and status persistence, denied access, mobile accessibility', async ({ page }) => {
  const headers = await login(page.request, 'admin'), path = '/admin/users/' + f.users.peer_a.id
  const peerToken = await login(page.request, 'peer_a')
  const original = (await (await page.request.get('/api/v1' + path, { headers })).json()).data
  const membership = original.memberships.find((m: { organisation_id: string }) => m.organisation_id === f.organisations.a)
  try {
    await signIn(page, 'admin')
    await page.locator(`a[href="${path}"]`).click()
    await expect(page).toHaveURL(new RegExp(path + '$'))
    await expect(page.getByRole('heading', { level: 1, name: original.full_name })).toBeVisible()
    expect((await page.getByRole('heading', { level: 1 }).boundingBox())!.y).toBeLessThan(500)
    await expect(page.getByText('Email verified', { exact: true })).toBeVisible()
    let region = page.getByRole('region', { name: 'Membership at ' + membership.organisation_name })
    await region.getByLabel('Membership role').selectOption('employee')
    await save(page, region.locator('form').first(), 'Save membership', path + '/memberships/' + membership.id, 'PATCH')
    await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible()
    expect((await (await page.request.get('/api/v1' + path, { headers })).json()).data.memberships.find((m: { id: string }) => m.id === membership.id).role).toBe('employee')
    region = page.getByRole('region', { name: 'Membership at ' + membership.organisation_name })
    await save(page, region.locator('form').last(), 'Revoke membership', path + '/memberships/' + membership.id, 'DELETE')
    await expect(region.getByText('employee · Revoked', { exact: true })).toBeVisible()
    await region.getByLabel('Membership state').selectOption('true')
    await region.getByLabel('Membership role').selectOption(membership.role)
    await save(page, region.locator('form').first(), 'Save membership', path + '/memberships/' + membership.id, 'PATCH')
    let account = page.getByRole('heading', { name: 'Account status', exact: true }).locator('..')
    await account.getByLabel('Account status', { exact: true }).selectOption('false')
    await save(page, account, 'Save account status', path + '/status', 'PATCH')
    await expect(page.getByText('Inactive account', { exact: true })).toBeVisible()
    expect((await page.request.get('/api/v1/auth/me', { headers: peerToken })).status()).toBe(401)
    expect((await page.request.post('/api/v1/auth/login', { data: { email: f.users.peer_a.email, password: f.users.peer_a.password } })).status()).toBe(401)
    account = page.getByRole('heading', { name: 'Account status', exact: true }).locator('..')
    await account.getByLabel('Account status', { exact: true }).selectOption('true')
    await save(page, account, 'Save account status', path + '/status', 'PATCH')
    await expect(page.getByText('Active account', { exact: true })).toBeVisible()
    await page.setViewportSize({ width: 360, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
    await page.getByRole('link', { name: 'Cancel and return to users' }).click()
    await expect(page).toHaveURL(/\/admin\/users$/)
    const client = await login(page.request, 'client_a')
    for (const route of [path, path + '/product-access', '/admin/organisations']) expect((await page.request.get('/api/v1' + route, { headers: client })).status()).toBe(403)
    expect((await page.request.post('/api/v1' + path + '/permissions', { headers: client, data: { membership_id: membership.id, permission: 'products.publish', is_active: true } })).status()).toBe(403)
    const employee = (await (await page.request.get('/api/v1/admin/users/' + f.users.employee.id, { headers })).json()).data
    expect((await page.request.patch('/api/v1' + path + '/memberships/' + employee.memberships[0].id, { headers, data: { role: 'admin' } })).status()).toBe(404)
    expect((await page.request.post('/api/v1' + path + '/permissions', { headers, data: { membership_id: employee.memberships[0].id, permission: 'products.publish', is_active: true } })).status()).toBe(404)
  } finally {
    expect((await page.request.patch('/api/v1' + path + '/status', { headers, data: { is_active: original.is_active } })).status()).toBe(200)
    expect((await page.request.patch('/api/v1' + path + '/memberships/' + membership.id, { headers, data: { role: membership.role, is_active: membership.is_active } })).status()).toBe(200)
  }
})

test('REAL catalogue: explicit independent grants, draft creation, edit, publish, immediate revocation, unpublish', async ({ page, browser }) => {
  test.setTimeout(180000)
  const admin = await login(page.request, 'admin'), employee = await login(page.request, 'employee')
  const path = '/admin/users/' + f.users.employee.id
  const original = (await (await page.request.get('/api/v1' + path + '/product-access', { headers: admin })).json()).data.grants
  const profile = (await (await page.request.get('/api/v1' + path, { headers: admin })).json()).data
  const member = profile.memberships.find((m: { role: string; is_active: boolean }) => m.role === 'employee' && m.is_active)
  const context = await browser.newContext(), staff = await context.newPage()
  let product = ''
  const actions = ['create', 'edit', 'publish', 'unpublish']
  async function grant(action: string, active = true) {
    const form = page.getByRole('button', { name: 'Save catalogue permission', exact: true }).locator('..')
    await form.getByLabel('Permission membership').selectOption(member.id)
    await form.getByLabel('Catalogue action').selectOption('products.' + action)
    await form.getByLabel('Permission state').selectOption(String(active))
    await save(page, form, 'Save catalogue permission', path + '/permissions', 'POST')
  }
  async function openProducts() {
    await staff.getByRole('link', { name: 'Account', exact: true }).click()
    await staff.getByRole('link', { name: 'Operations', exact: true }).click()
    await staff.getByRole('button', { name: 'Products', exact: true }).click()
    if (product) await staff.getByLabel('Offering to manage').selectOption(product)
  }
  try {
    for (const action of actions) expect((await page.request.post('/api/v1' + path + '/permissions', { headers: admin, data: { membership_id: member.id, permission: 'products.' + action, is_active: false } })).status()).toBe(200)
    expect((await page.request.post('/api/v1/products', { headers: employee, data: { name: 'Denied offering' } })).status()).toBe(403)
    await signIn(page, 'admin', path)
    await signIn(staff, 'employee', '/operations')
    await expect(staff.getByRole('button', { name: 'Products', exact: true })).toHaveCount(0)
    await grant('create')
    await openProducts()
    const create = staff.getByRole('heading', { name: 'Create product', exact: true }).locator('..')
    await create.getByLabel('Product name').fill('Portfolio Review Intelligence Demo ' + new Date().toISOString())
    await create.getByLabel('Description').fill('Helps relationship teams prepare consistent portfolio reviews using structured operating insights.')
    const creation = staff.waitForResponse(r => r.url().endsWith('/api/v1/products') && r.request().method() === 'POST')
    await create.getByRole('button', { name: 'Create unpublished product' }).click()
    const response = await creation
    expect(response.status()).toBe(201)
    const draft = (await response.json()).data; product = draft.id
    expect(draft.is_published).toBe(false)
    expect((await page.request.get('/api/v1/products/' + product)).status()).toBe(404)
    expect((await page.request.post('/api/v1/products/' + product + '/publish', { headers: employee })).status()).toBe(403)
    expect((await page.request.patch('/api/v1/products/' + product, { headers: employee, data: { description: 'Denied edit' } })).status()).toBe(403)
    await grant('edit'); await openProducts()
    const edit = staff.getByRole('heading', { name: 'Edit product', exact: true }).locator('..')
    await edit.getByLabel('Description').fill('Provides consistent portfolio review preparation and actionable insights for relationship teams.')
    const update = staff.waitForResponse(r => new URL(r.url()).pathname.endsWith('/products/' + product) && r.request().method() === 'PATCH')
    await edit.getByRole('button', { name: 'Update product details' }).click(); expect((await update).status()).toBe(200)
    expect((await page.request.patch('/api/v1/products/' + product, { headers: employee, data: { is_published: true } })).status()).toBe(403)
    await grant('publish'); await openProducts()
    await save(staff, staff.getByRole('button', { name: 'Publish offering', exact: true }).locator('..'), 'Publish offering', '/products/' + product + '/publish', 'POST')
    expect((await page.request.get('/api/v1/products/' + product)).status()).toBe(200)
    await grant('publish', false)
    expect((await page.request.post('/api/v1/products/' + product + '/publish', { headers: employee })).status()).toBe(403)
    expect((await page.request.patch('/api/v1/products/' + product, { headers: employee, data: { description: 'Denied live edit' } })).status()).toBe(403)
    expect((await page.request.delete('/api/v1/products/' + product, { headers: employee })).status()).toBe(403)
    await grant('unpublish'); await openProducts()
    await save(staff, staff.getByRole('button', { name: 'Unpublish product', exact: true }).locator('..'), 'Unpublish product', '/products/' + product, 'DELETE')
    expect((await page.request.get('/api/v1/products/' + product)).status()).toBe(404)
    await save(page, page.getByRole('button', { name: 'Revoke unpublish permission', exact: true }).locator('..'), 'Revoke unpublish permission', path + '/permissions', 'POST')
    expect((await page.request.delete('/api/v1/products/' + product, { headers: employee })).status()).toBe(403)
    await expect(staff.locator('main')).not.toContainText('currently requires admin')
  } finally {
    if (product) expect((await page.request.delete('/api/v1/products/' + product, { headers: admin })).status()).toBe(200)
    for (const action of actions) {
      const old = original.find((g: { membership_id: string; permission: string }) => g.membership_id === member.id && g.permission === 'products.' + action)
      expect((await page.request.post('/api/v1' + path + '/permissions', { headers: admin, data: { membership_id: member.id, permission: 'products.' + action, is_active: old?.is_active ?? false } })).status()).toBe(200)
    }
    await context.close()
  }
})

test('REAL admin: assign membership and enable/revoke organisation product access', async ({ page }) => {
  const headers = await login(page.request, 'admin'), path = '/admin/users/' + f.users.peer_a.id
  const original = (await (await page.request.get('/api/v1' + path, { headers })).json()).data
  const organisations = (await (await page.request.get('/api/v1/admin/organisations', { headers })).json()).data
  const organisation = organisations.find((o: { id: string }) => !original.memberships.some((m: { organisation_id: string }) => m.organisation_id === o.id))?.id ?? f.organisations.c
  const existing = original.memberships.find((m: { organisation_id: string }) => m.organisation_id === organisation)
  let membership = existing?.id, product = ''
  try {
    const created = await page.request.post('/api/v1/products', { headers, data: { name: 'Organisation Access Review Demo ' + new Date().toISOString(), is_published: false } })
    expect(created.status()).toBe(201); product = (await created.json()).data.id
    await signIn(page, 'admin', path)
    if (!existing) {
      const form = page.getByRole('button', { name: 'Assign membership', exact: true }).locator('..')
      await form.getByLabel('Organisation', { exact: true }).selectOption(organisation)
      await form.getByLabel('Role', { exact: true }).selectOption('client')
      await save(page, form, 'Assign membership', path + '/memberships', 'POST', 201)
    } else {
      expect((await page.request.patch('/api/v1' + path + '/memberships/' + membership, { headers, data: { is_active: true } })).status()).toBe(200)
      await page.getByRole('link', { name: 'Cancel and return to users' }).click()
      await page.locator(`a[href="${path}"]`).click()
    }
    const current = (await (await page.request.get('/api/v1' + path, { headers })).json()).data
    membership = current.memberships.find((m: { organisation_id: string }) => m.organisation_id === organisation).id
    let form = page.getByRole('button', { name: 'Save product access', exact: true }).locator('..')
    await form.getByLabel('Product access organisation').selectOption(organisation)
    await form.getByLabel('Product', { exact: true }).selectOption(product)
    await save(page, form, 'Save product access', '/entitlements/product', 'POST')
    let access = (await (await page.request.get('/api/v1' + path + '/product-access', { headers })).json()).data
    expect(access.entitlements.find((e: { product_id: string }) => e.product_id === product).is_active).toBe(true)
    form = page.getByRole('button', { name: 'Save product access', exact: true }).locator('..')
    await form.getByLabel('Product access organisation').selectOption(organisation)
    await form.getByLabel('Product', { exact: true }).selectOption(product)
    await form.getByLabel('Product access state').selectOption('false')
    await save(page, form, 'Save product access', '/entitlements/product', 'POST')
    access = (await (await page.request.get('/api/v1' + path + '/product-access', { headers })).json()).data
    expect(access.entitlements.find((e: { product_id: string }) => e.product_id === product).is_active).toBe(false)
    const region = page.getByRole('region', { name: 'Membership at ' + current.memberships.find((m: { id: string }) => m.id === membership).organisation_name })
    await save(page, region.getByRole('button', { name: 'Revoke membership', exact: true }).locator('..'), 'Revoke membership', path + '/memberships/' + membership, 'DELETE')
  } finally {
    if (product) {
      expect((await page.request.post('/api/v1/entitlements/product', { headers, data: { organisation_id: organisation, product_id: product, is_active: false } })).status()).toBe(200)
      expect((await page.request.delete('/api/v1/products/' + product, { headers })).status()).toBe(200)
    }
    if (!membership) membership = (await (await page.request.get('/api/v1' + path, { headers })).json()).data.memberships.find((m: { organisation_id: string }) => m.organisation_id === organisation)?.id
    if (membership) expect((await page.request.patch('/api/v1' + path + '/memberships/' + membership, { headers, data: { role: existing?.role ?? 'client', is_active: existing?.is_active ?? false } })).status()).toBe(200)
  }
})
