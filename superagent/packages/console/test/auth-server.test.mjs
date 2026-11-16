import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { startMockServer } from './mock-server.mjs'

const rootKey = 'test-root-key-never-ship-this'
let server
let origin
before(async () => {
  server = await startMockServer({ host: '0.0.0.0', rootApiKey: rootKey })
  origin = `http://127.0.0.1:${server.address().port}`
})
after(() => new Promise((resolve) => { if (!server) return resolve(); server.close(resolve); server.closeAllConnections?.() }))
const call = (path, options = {}) => fetch(`${origin}${path}`, options)

test('non-loopback startup without root key is rejected before listen', async () => {
  await assert.rejects(startMockServer({ host: '0.0.0.0' }), /without root_api_key/)
})

test('session discovery is public but API data requires the root key', async () => {
  const discovery = await call('/api/v1/auth/session')
  assert.equal(discovery.status, 200)
  assert.deepEqual(await discovery.json(), { authenticationRequired: true, authenticated: false })
  const missing = await call('/api/v1/instances')
  assert.equal(missing.status, 401)
  assert.equal(missing.headers.get('www-authenticate'), 'Bearer')
  assert.equal((await missing.json()).error.code, 'unauthenticated')
  assert.equal((await call('/api/v1/instances', { headers: { authorization: 'Bearer wrong' } })).status, 401)
  assert.equal((await call('/api/v1/instances', { headers: { authorization: `Bearer ${rootKey}` } })).status, 200)
  assert.equal((await call('/api/v1/instances', { headers: { 'x-api-key': rootKey } })).status, 200)
})

test('login issues an HttpOnly same-site session and logout revokes it', async () => {
  const missingCsrf = await call('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ rootApiKey: rootKey }) })
  assert.equal(missingCsrf.status, 403)
  const wrong = await call('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 'demo-owner' }, body: JSON.stringify({ rootApiKey: 'wrong' }) })
  assert.equal(wrong.status, 401)
  assert.equal(wrong.headers.get('set-cookie'), null)

  const login = await call('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 'demo-owner' }, body: JSON.stringify({ rootApiKey: rootKey }) })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie')
  assert.match(cookie, /^ovsa_console_session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200/)
  assert.equal(cookie.includes(rootKey), false)
  const session = cookie.split(';')[0]
  assert.equal((await call('/api/v1/instances', { headers: { cookie: session } })).status, 200)
  assert.deepEqual(await (await call('/api/v1/auth/session', { headers: { cookie: session } })).json(), { authenticationRequired: true, authenticated: true })

  const logout = await call('/api/v1/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 'demo-owner', cookie: session }, body: '{}' })
  assert.equal(logout.status, 200)
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal((await call('/api/v1/instances', { headers: { cookie: session } })).status, 401)
})

test('login page and frontend bundle do not contain the configured root key', async () => {
  const page = await call('/console/?demo=1')
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.equal(html.includes(rootKey), false)
  const asset = /src="([^"]+\.js)"/.exec(html)?.[1]
  assert.ok(asset)
  const bundle = await call(asset)
  assert.equal(bundle.status, 200)
  assert.equal((await bundle.text()).includes(rootKey), false)
})
