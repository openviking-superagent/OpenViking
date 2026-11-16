import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { startMockServer } from './mock-server.mjs'

const screenshots = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/console')
await mkdir(screenshots, { recursive: true })
const rootKey = 'browser-root-key-not-in-bundle'
const server = await startMockServer({ host: '0.0.0.0', rootApiKey: rootKey })
let browser
try {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const origin = `http://127.0.0.1:${server.address().port}`
  await page.goto(`${origin}/?demo=1`)
  await expect(page.getByRole('heading', { name: 'Sign in to OVSA Console' })).toBeVisible()
  await expect(page.getByText('Interactive mock demo · isolated data only')).toBeVisible()
  await page.screenshot({ path: path.join(screenshots, 'demo-login.png'), fullPage: true, animations: 'disabled' })
  await page.getByLabel('Root API key').fill('wrong-key')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid root API key')
  await page.getByLabel('Root API key').fill(rootKey)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Instance overview' })).toBeVisible()
  const cookies = await context.cookies(origin)
  const session = cookies.find((cookie) => cookie.name === 'ovsa_console_session')
  assert.ok(session)
  assert.equal(session.httpOnly, true)
  assert.equal(session.sameSite, 'Strict')
  assert.equal(session.value.includes(rootKey), false)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Instance overview' })).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to OVSA Console' })).toBeVisible()
  assert.deepEqual(errors, [])
  console.log('Authenticated Console browser flow passed')
} finally {
  await browser?.close()
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections?.() })
}
