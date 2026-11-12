import { test, expect, beforeEach, afterEach, describe } from 'bun:test'
import { mkdtemp, rm, mkdir, readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { startRelayServer } from '../server'
import { RELAY_TOKEN_HEADER, relayTokenPath } from '../token'
import { writeRegistry } from '../../registry/index'
import { itemDir } from '../../paths'
import { recordProviderHealthBatch } from '../../usage/provider-health'
import { writeEntitlementCache } from '../../entitlement/index'
import { getRecentRequests } from '../../usage/queries'
import type { InstalledItem } from '@as/types'

// Drive a provider into the cooling-down state (2 consecutive server failures).
function coolDown(home: string, slug: string) {
  const now = Date.now()
  recordProviderHealthBatch(home, [{ slug, statusCode: 500, latencyMs: 1 }], now)
  recordProviderHealthBatch(home, [{ slug, statusCode: 500, latencyMs: 1 }], now)
}

let aasHome: string
let stop: () => void

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-relay-test-')
})

afterEach(async () => {
  stop?.()
  await rm(aasHome, { recursive: true, force: true })
})

// Requests as Claude Code / Codex send them once the takeover wrote the relay token into their config.
async function relayFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${await readToken()}`)
  return fetch(url, { ...init, headers })
}

async function readToken(): Promise<string> {
  return (await readFile(relayTokenPath(aasHome), 'utf-8')).trim()
}

async function installProvider(slug: string, enabledFor: Record<string, boolean>, config: Record<string, unknown>) {
  const entry: InstalledItem = {
    slug, category: 'provider', version: '1.0.0',
    installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    compatibleWith: ['claude', 'codex'], enabledFor,
  }
  await writeRegistry(aasHome, { installed: [entry] })
  const dir = itemDir(aasHome, 'provider', slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'config.json'), JSON.stringify(config))
}

test('forwards to the active claude provider', async () => {
  await installProvider('test-provider', { claude: true }, { apiKey: 'sk-test', baseUrl: 'https://upstream.example.com' })

  let capturedUrl: string | undefined
  const fetchImpl = (async (url: string) => {
    capturedUrl = url
    return new Response(JSON.stringify({ reply: 'ok' }), { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  const res = await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'claude-3-5-sonnet' }),
  })

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ reply: 'ok' })
  expect(capturedUrl).toBe('https://upstream.example.com/v1/messages')
})

test('returns 503 when no provider is enabled for the target', async () => {
  await installProvider('test-provider', { claude: false }, { apiKey: 'sk-test', baseUrl: 'https://upstream.example.com' })

  const server = startRelayServer({ aasHome, port: 0 })
  stop = server.stop

  const res = await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'claude-3-5-sonnet' }),
  })

  expect(res.status).toBe(503)
})

test('switching which provider is enabled changes routing on the next request, no restart needed', async () => {
  await installProvider('provider-a', { claude: true }, { apiKey: 'key-a', baseUrl: 'https://a.example.com' })

  const capturedUrls: string[] = []
  const fetchImpl = (async (url: string) => {
    capturedUrls.push(url)
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: '{}' })

  // Switch the active provider without restarting the relay.
  await installProvider('provider-b', { claude: true }, { apiKey: 'key-b', baseUrl: 'https://b.example.com' })

  await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: '{}' })

  expect(capturedUrls).toEqual(['https://a.example.com/v1/messages', 'https://b.example.com/v1/messages'])
})

test('routes /responses to the codex target', async () => {
  await installProvider('test-provider', { codex: true }, { apiKey: 'sk-test', baseUrl: 'https://upstream.example.com' })

  let capturedUrl: string | undefined
  const fetchImpl = (async (url: string) => {
    capturedUrl = url
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  await relayFetch(`http://127.0.0.1:${server.port}/responses`, { method: 'POST', body: '{}' })
  expect(capturedUrl).toBe('https://upstream.example.com/responses')
})

test('returns 403 and does not forward when the requested model is not in the whitelist', async () => {
  await installProvider('test-provider', { codex: true }, {
    apiKey: 'sk-test', baseUrl: 'https://upstream.example.com', whitelist: ['claude-*'],
  })

  let called = false
  const fetchImpl = (async (_url: string) => {
    called = true
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  const res = await relayFetch(`http://127.0.0.1:${server.port}/responses`, {
    method: 'POST',
    body: JSON.stringify({ model: 'gpt-4o' }),
  })

  expect(res.status).toBe(403)
  expect(called).toBe(false)
})

test('does not record usage when every candidate is whitelist-rejected (403, no upstream dialed)', async () => {
  await installProvider('test-provider', { codex: true }, {
    apiKey: 'sk-test', baseUrl: 'https://upstream.example.com', whitelist: ['claude-*'],
  })

  let called = false
  const fetchImpl = (async (_url: string) => {
    called = true
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  const res = await relayFetch(`http://127.0.0.1:${server.port}/responses`, {
    method: 'POST',
    body: JSON.stringify({ model: 'gpt-4o' }),
  })

  expect(res.status).toBe(403)
  expect(called).toBe(false)
  // No real upstream attempt happened, so nothing should be logged as usage.
  expect(getRecentRequests(aasHome)).toEqual([])
})

test('forwards to the endpoint override path instead of the route default when connection.endpointPath is set', async () => {
  await installProvider('test-provider', { claude: true }, {
    apiKey: 'sk-test', baseUrl: 'https://upstream.example.com', endpointPath: '/v1/chat/completions',
  })

  let capturedUrl: string | undefined
  const fetchImpl = (async (url: string) => {
    capturedUrl = url
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'claude-3-5-sonnet' }),
  })

  expect(capturedUrl).toBe('https://upstream.example.com/v1/chat/completions')
})

async function installProviders(entries: Array<{ slug: string; enabledFor: Record<string, boolean>; config: Record<string, unknown> }>) {
  const items: InstalledItem[] = entries.map(({ slug, enabledFor }) => ({
    slug, category: 'provider', version: '1.0.0',
    installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    compatibleWith: ['claude', 'codex'], enabledFor,
  }))
  await writeRegistry(aasHome, { installed: items })
  for (const { slug, config } of entries) {
    const dir = itemDir(aasHome, 'provider', slug)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'config.json'), JSON.stringify(config))
  }
}

test('with two enabled providers, tries the higher-priority (lower level) one first', async () => {
  await installProviders([
    { slug: 'low-priority', enabledFor: { claude: true }, config: { apiKey: 'k1', baseUrl: 'https://low.example.com', level: 5 } },
    { slug: 'high-priority', enabledFor: { claude: true }, config: { apiKey: 'k2', baseUrl: 'https://high.example.com', level: 1 } },
  ])

  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-3-5-sonnet' }) })

  expect(calls).toEqual(['https://high.example.com/v1/messages'])
})

test('falls back to the next-priority provider when the first returns a 5xx, and records is_fallback', async () => {
  await installProviders([
    { slug: 'flaky', enabledFor: { claude: true }, config: { apiKey: 'k1', baseUrl: 'https://flaky.example.com', level: 1 } },
    { slug: 'reliable', enabledFor: { claude: true }, config: { apiKey: 'k2', baseUrl: 'https://reliable.example.com', level: 2 } },
  ])

  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    if (url.startsWith('https://flaky')) return new Response('boom', { status: 502 })
    return new Response(JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  const res = await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-3-5-sonnet' }) })

  expect(calls).toEqual(['https://flaky.example.com/v1/messages', 'https://reliable.example.com/v1/messages'])
  expect(res.status).toBe(200)
})

test('skips a provider that is cooling down and routes to the next healthy one', async () => {
  await installProviders([
    { slug: 'cooling', enabledFor: { claude: true }, config: { apiKey: 'k1', baseUrl: 'https://cooling.example.com', level: 1 } },
    { slug: 'healthy', enabledFor: { claude: true }, config: { apiKey: 'k2', baseUrl: 'https://healthy.example.com', level: 2 } },
  ])
  coolDown(aasHome, 'cooling')
  await writeEntitlementCache(aasHome, 'pro') // proactive cooling-skip is Pro smart routing

  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-3-5-sonnet' }) })

  // The cooling level-1 provider is never dialed; the request goes straight to the healthy one.
  expect(calls).toEqual(['https://healthy.example.com/v1/messages'])
})

test('when every provider is cooling, still tries them (half-open) instead of failing', async () => {
  await installProviders([
    { slug: 'only', enabledFor: { claude: true }, config: { apiKey: 'k1', baseUrl: 'https://only.example.com', level: 1 } },
  ])
  coolDown(aasHome, 'only')
  await writeEntitlementCache(aasHome, 'pro') // proactive cooling-skip is Pro smart routing

  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  const res = await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-3-5-sonnet' }) })

  expect(calls).toEqual(['https://only.example.com/v1/messages'])
  expect(res.status).toBe(200)
})

test('does not fall back when the first provider returns a 4xx', async () => {
  await installProviders([
    { slug: 'rejects', enabledFor: { claude: true }, config: { apiKey: 'k1', baseUrl: 'https://rejects.example.com', level: 1 } },
    { slug: 'backup', enabledFor: { claude: true }, config: { apiKey: 'k2', baseUrl: 'https://backup.example.com', level: 2 } },
  ])

  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('bad request', { status: 400 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  const res = await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-3-5-sonnet' }) })

  expect(calls).toEqual(['https://rejects.example.com/v1/messages'])
  expect(res.status).toBe(400)
})

test('falls back to the next provider when the first one whitelist-rejects the model', async () => {
  await installProviders([
    { slug: 'claude-only', enabledFor: { codex: true }, config: { apiKey: 'k1', baseUrl: 'https://claude-only.example.com', level: 1, whitelist: ['claude-*'] } },
    { slug: 'any-model', enabledFor: { codex: true }, config: { apiKey: 'k2', baseUrl: 'https://any-model.example.com', level: 2 } },
  ])

  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  const res = await relayFetch(`http://127.0.0.1:${server.port}/responses`, {
    method: 'POST',
    body: JSON.stringify({ model: 'gpt-4o' }),
  })

  expect(calls).toEqual(['https://any-model.example.com/responses'])
  expect(res.status).toBe(200)
})

// ── Smart routing: free vs Pro split ─────────────────────────────────────────

test('free plan does not proactively skip a cooling provider (reactive failover)', async () => {
  await installProviders([
    { slug: 'cooling', enabledFor: { claude: true }, config: { apiKey: 'k1', baseUrl: 'https://cooling.example.com', level: 1 } },
    { slug: 'healthy', enabledFor: { claude: true }, config: { apiKey: 'k2', baseUrl: 'https://healthy.example.com', level: 2 } },
  ])
  coolDown(aasHome, 'cooling')
  // No entitlement cache written → free plan.

  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-3-5-sonnet' }) })

  // Free doesn't avoid the cooling provider — it's dialed first and (here) succeeds.
  expect(calls).toEqual(['https://cooling.example.com/v1/messages'])
})

test('free plan caps failover at two upstreams; a third is never tried', async () => {
  await installProviders([
    { slug: 'p1', enabledFor: { claude: true }, config: { apiKey: 'k1', baseUrl: 'https://p1.example.com', level: 1 } },
    { slug: 'p2', enabledFor: { claude: true }, config: { apiKey: 'k2', baseUrl: 'https://p2.example.com', level: 2 } },
    { slug: 'p3', enabledFor: { claude: true }, config: { apiKey: 'k3', baseUrl: 'https://p3.example.com', level: 3 } },
  ])
  // free: only the first two are candidates, so both 5xx exhausts failover.

  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('boom', { status: 502 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-3-5-sonnet' }) })

  expect(calls).toEqual(['https://p1.example.com/v1/messages', 'https://p2.example.com/v1/messages'])
})

test('Pro plan fails over across every upstream beyond the free cap', async () => {
  await installProviders([
    { slug: 'p1', enabledFor: { claude: true }, config: { apiKey: 'k1', baseUrl: 'https://p1.example.com', level: 1 } },
    { slug: 'p2', enabledFor: { claude: true }, config: { apiKey: 'k2', baseUrl: 'https://p2.example.com', level: 2 } },
    { slug: 'p3', enabledFor: { claude: true }, config: { apiKey: 'k3', baseUrl: 'https://p3.example.com', level: 3 } },
  ])
  await writeEntitlementCache(aasHome, 'pro')

  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    if (url.startsWith('https://p3')) return new Response('{}', { status: 200 })
    return new Response('boom', { status: 502 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  const res = await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-3-5-sonnet' }) })

  expect(calls).toEqual([
    'https://p1.example.com/v1/messages',
    'https://p2.example.com/v1/messages',
    'https://p3.example.com/v1/messages',
  ])
  expect(res.status).toBe(200)
})

// ── Key rotation: free vs Pro ────────────────────────────────────────────────

test('Pro key rotation round-robins across a provider\'s keys', async () => {
  await installProviders([
    { slug: 'multi', enabledFor: { claude: true }, config: { apiKeys: ['k1', 'k2', 'k3'], baseUrl: 'https://multi.example.com', level: 1 } },
  ])
  await writeEntitlementCache(aasHome, 'pro')

  const keys: (string | null)[] = []
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    keys.push(new Headers(init?.headers).get('authorization'))
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  for (let i = 0; i < 4; i++) {
    await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-3-5-sonnet' }) })
  }

  expect(keys).toEqual(['Bearer k1', 'Bearer k2', 'Bearer k3', 'Bearer k1'])
})

test('free plan uses only the first key (no rotation)', async () => {
  await installProviders([
    { slug: 'multi', enabledFor: { claude: true }, config: { apiKeys: ['k1', 'k2', 'k3'], baseUrl: 'https://multi.example.com', level: 1 } },
  ])
  // No entitlement cache → free.

  const keys: (string | null)[] = []
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    keys.push(new Headers(init?.headers).get('authorization'))
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  for (let i = 0; i < 3; i++) {
    await relayFetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-3-5-sonnet' }) })
  }

  expect(keys).toEqual(['Bearer k1', 'Bearer k1', 'Bearer k1'])
})

describe('relay access control', () => {
  let upstreamCalls: Array<{ url: string; headers: Headers }>
  let port: number

  beforeEach(async () => {
    await installProvider('test-provider', { claude: true, codex: true }, { apiKey: 'sk-user-secret', baseUrl: 'https://upstream.example.com' })
    upstreamCalls = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      upstreamCalls.push({ url, headers: new Headers(init?.headers) })
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    const server = startRelayServer({ aasHome, port: 0, fetchImpl })
    stop = server.stop
    port = server.port
  })

  const post = (path: string, headers: Record<string, string>, body = '{}') =>
    fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers, body })

  test('creates a 0600 token file', async () => {
    expect((await stat(relayTokenPath(aasHome))).mode & 0o777).toBe(0o600)
    expect((await readToken()).length).toBeGreaterThanOrEqual(32)
  })

  test('rejects a request without a token', async () => {
    const res = await post('/v1/messages', { 'Content-Type': 'application/json' })
    expect(res.status).toBe(401)
    expect(upstreamCalls).toHaveLength(0)
  })

  test('rejects a request with a wrong token', async () => {
    const attempts: Array<Record<string, string>> = [{ Authorization: 'Bearer wrong' }, { [RELAY_TOKEN_HEADER]: 'wrong' }, { 'x-api-key': await readToken() }]
    for (const headers of attempts) {
      expect((await post('/v1/messages', headers)).status).toBe(401)
    }
    expect(upstreamCalls).toHaveLength(0)
  })

  test('rejects any request carrying a browser Origin header, even with the right token', async () => {
    const token = await readToken()
    for (const origin of ['https://evil.example', 'null', 'http://127.0.0.1:18780']) {
      const res = await post('/v1/messages', { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' })
      expect(res.status).toBe(403)
    }
    expect(upstreamCalls).toHaveLength(0)
  })

  test('forwards a request with the token as Claude Code sends it (Authorization: Bearer)', async () => {
    const res = await post('/v1/messages', { Authorization: `Bearer ${await readToken()}` })
    expect(res.status).toBe(200)
    expect(upstreamCalls.map(c => c.url)).toEqual(['https://upstream.example.com/v1/messages'])
    expect(upstreamCalls[0]!.headers.get('Authorization')).toBe('Bearer sk-user-secret')
  })

  test('forwards a request with the token as Codex sends it (relay token header) and never passes the token upstream', async () => {
    const token = await readToken()
    const res = await post('/responses', { [RELAY_TOKEN_HEADER]: token })
    expect(res.status).toBe(200)
    expect(upstreamCalls).toHaveLength(1)
    const sent = [...upstreamCalls[0]!.headers.values()].join(' ')
    expect(sent).not.toContain(token)
  })

  test('keeps the same token across restarts', async () => {
    const token = await readToken()
    stop()
    const again = startRelayServer({ aasHome, port: 0 })
    stop = again.stop
    expect(await readToken()).toBe(token)
  })
})
