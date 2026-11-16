// Configuration for the isolated Console mock. Never import this into production code.
import { readFile } from 'node:fs/promises'
import { isIP } from 'node:net'

export function isLoopbackHost(host) {
  if (typeof host !== 'string') return false
  const value = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (value === 'localhost' || value === '::1') return true
  const ipv4 = value.startsWith('::ffff:') ? value.slice(7) : value
  if (!isIP(ipv4)) return false
  const first = Number(ipv4.split('.')[0])
  return isIP(ipv4) === 4 && first === 127
}

function validateHost(host) {
  if (typeof host !== 'string' || (!isLoopbackHost(host) && !isIP(host.replace(/^\[|\]$/g, '')))) {
    throw new Error('Console host must be an IP address or localhost')
  }
  return host.replace(/^\[|\]$/g, '')
}

function validatePort(port, { allowZero = false } = {}) {
  const minimum = allowZero ? 0 : 1
  if (!Number.isSafeInteger(port) || port < minimum || port > 65535) {
    throw new Error(`Console port must be an integer between ${minimum} and 65535`)
  }
  return port
}

function validateRootKey(rootApiKey) {
  if (rootApiKey === undefined || rootApiKey === null) return undefined
  if (typeof rootApiKey !== 'string' || rootApiKey.length === 0 || rootApiKey.trim().length === 0) {
    throw new Error('Console root_api_key must be a non-empty string; omit it to disable authentication on loopback')
  }
  if (rootApiKey.length > 4096) throw new Error('Console root_api_key is too long')
  if (rootApiKey === 'replace-with-a-long-random-secret') throw new Error('Replace the example root_api_key before starting the Console')
  return rootApiKey
}

export function validateConsoleServerConfig({ host = '127.0.0.1', port = 3740, rootApiKey, secureCookies = false } = {}, options) {
  const normalized = {
    host: validateHost(host),
    port: validatePort(port, options),
    rootApiKey: validateRootKey(rootApiKey),
    secureCookies,
  }
  if (typeof secureCookies !== 'boolean') throw new Error('Console secure_cookies must be a boolean')
  if (!isLoopbackHost(normalized.host) && !normalized.rootApiKey) {
    throw new Error(`Refusing to listen on non-loopback ${normalized.host} without root_api_key`)
  }
  return normalized
}

export async function loadConsoleServerConfig(configPath = process.env.OVSA_CONSOLE_CONFIG) {
  let file = {}
  if (configPath) {
    let parsed
    try { parsed = JSON.parse(await readFile(configPath, 'utf8')) }
    catch (error) { throw new Error(`Cannot load Console config ${configPath}: ${error.message}`) }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Console config must be a JSON object')
    const allowed = new Set(['host', 'port', 'root_api_key', 'secure_cookies'])
    for (const key of Object.keys(parsed)) if (!allowed.has(key)) throw new Error(`Unknown Console config field: ${key}`)
    file = parsed
  }
  const port = process.env.OVSA_CONSOLE_PORT === undefined ? file.port : Number(process.env.OVSA_CONSOLE_PORT)
  return validateConsoleServerConfig({
    host: process.env.OVSA_CONSOLE_HOST ?? file.host,
    port,
    rootApiKey: process.env.OVSA_CONSOLE_ROOT_API_KEY ?? file.root_api_key,
    secureCookies: file.secure_cookies,
  })
}
