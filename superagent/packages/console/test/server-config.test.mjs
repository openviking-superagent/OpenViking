import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { isLoopbackHost, loadConsoleServerConfig, validateConsoleServerConfig } from './server-config.mjs'

test('loopback validation covers IPv4, IPv6, and IPv4-mapped IPv6', () => {
  for (const host of ['127.0.0.1', '127.0.0.2', 'localhost', '::1', '[::1]', '::ffff:127.0.0.1']) assert.equal(isLoopbackHost(host), true, host)
  for (const host of ['0.0.0.0', '::', '192.168.1.8', '2001:db8::1', 'localhost.example', 'example.com']) assert.equal(isLoopbackHost(host), false, host)
})

test('non-loopback listeners require a non-empty root key before listening', () => {
  assert.throws(() => validateConsoleServerConfig({ host: '0.0.0.0', port: 3740 }), /without root_api_key/)
  assert.throws(() => validateConsoleServerConfig({ host: '::', port: 3740 }), /without root_api_key/)
  assert.throws(() => validateConsoleServerConfig({ host: '127.0.0.1', rootApiKey: '' }), /non-empty/)
  assert.throws(() => validateConsoleServerConfig({ host: '0.0.0.0', rootApiKey: 'replace-with-a-long-random-secret' }), /Replace the example/)
  assert.equal(validateConsoleServerConfig({ host: '::1', port: 3740 }).rootApiKey, undefined)
  assert.equal(validateConsoleServerConfig({ host: '0.0.0.0', port: 3740, rootApiKey: 'test-key' }).rootApiKey, 'test-key')
})

test('environment values override listener and secret without a config file', async () => {
  const names = ['OVSA_CONSOLE_CONFIG', 'OVSA_CONSOLE_HOST', 'OVSA_CONSOLE_PORT', 'OVSA_CONSOLE_ROOT_API_KEY']
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  try {
    delete process.env.OVSA_CONSOLE_CONFIG
    process.env.OVSA_CONSOLE_HOST = '0.0.0.0'
    process.env.OVSA_CONSOLE_PORT = '4242'
    process.env.OVSA_CONSOLE_ROOT_API_KEY = 'environment-key'
    assert.deepEqual(await loadConsoleServerConfig(), { host: '0.0.0.0', port: 4242, rootApiKey: 'environment-key', secureCookies: false })
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    }
  }
})

test('JSON config supplies listener and root key', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ovsa-console-config-'))
  try {
    const filename = path.join(directory, 'console.json')
    await writeFile(filename, JSON.stringify({ host: '0.0.0.0', port: 4100, root_api_key: 'file-key', secure_cookies: true }))
    assert.deepEqual(await loadConsoleServerConfig(filename), { host: '0.0.0.0', port: 4100, rootApiKey: 'file-key', secureCookies: true })
    await writeFile(filename, JSON.stringify({ host: '127.0.0.1', port: 3740, unknown: true }))
    await assert.rejects(loadConsoleServerConfig(filename), /Unknown Console config field/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
