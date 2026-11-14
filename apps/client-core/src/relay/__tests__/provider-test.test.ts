import { test, expect } from 'bun:test'
import { testProviderConnection } from '../provider-test'

const KEY = 'sk-test-0123456789abcdef'

function fakeFetch(status: number, body = '', seen: Array<{ url: string; init: RequestInit }> = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    seen.push({ url, init })
    return new Response(body, { status })
  }) as unknown as typeof fetch
}

test('sends the request the relay would send, with an empty body', async () => {
  const seen: Array<{ url: string; init: RequestInit }> = []
  const result = await testProviderConnection(
    { baseUrl: 'https://api.example.com', apiKey: KEY, authType: 'anthropic' },
    'claude',
    { fetchImpl: fakeFetch(400, '{"error":{"message":"model: Field required"}}', seen) }
  )
  expect(seen).toHaveLength(1)
  expect(seen[0]!.url).toBe('https://api.example.com/v1/messages')
  expect(seen[0]!.init.method).toBe('POST')
  expect(seen[0]!.init.body).toBe('{}')
  expect((seen[0]!.init.headers as Record<string, string>)['x-api-key']).toBe(KEY)
  expect(result).toMatchObject({ target: 'claude', outcome: 'ok', ok: true, statusCode: 400 })
  expect(result.message).toBeUndefined()
  expect(typeof result.latencyMs).toBe('number')
})

test('uses the provider endpoint path and the first rotation key, like the relay', async () => {
  const seen: Array<{ url: string; init: RequestInit }> = []
  await testProviderConnection(
    { baseUrl: 'https://openrouter.ai/api/v1', endpointPath: '/chat/completions', apiKey: 'old', apiKeys: [KEY, 'sk-other-key-000000'] },
    'codex',
    { fetchImpl: fakeFetch(422, '', seen) }
  )
  expect(seen[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions')
  expect((seen[0]!.init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${KEY}`)
})

test.each([
  [401, 'key-rejected'],
  [403, 'key-rejected'],
  [404, 'not-found'],
  [429, 'rate-limited'],
  [301, 'redirected'],
  [503, 'upstream-error'],
  [418, 'unexpected-status'],
  [200, 'ok'],
] as const)('HTTP %i reads as %s', async (status, outcome) => {
  const result = await testProviderConnection({ baseUrl: 'https://api.example.com', apiKey: KEY }, 'codex', { fetchImpl: fakeFetch(status) })
  expect(result.outcome).toBe(outcome)
  expect(result.ok).toBe(outcome === 'ok')
})

test('never returns the key, not even the part a provider echoes', async () => {
  const body = JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}. Also seen as sk-tes****cdef.` } })
  const result = await testProviderConnection({ baseUrl: 'https://api.example.com', apiKey: KEY }, 'codex', { fetchImpl: fakeFetch(401, body) })
  expect(result.outcome).toBe('key-rejected')
  expect(result.message).toContain('Incorrect API key provided')
  expect(JSON.stringify(result)).not.toContain(KEY)
  expect(JSON.stringify(result)).not.toContain('cdef')
})

test('reports an unreachable address with the network error', async () => {
  const failing = (async () => {
    throw new Error('Unable to connect. Is the computer able to access the url?')
  }) as unknown as typeof fetch
  const result = await testProviderConnection({ baseUrl: 'http://127.0.0.1:9', apiKey: KEY }, 'claude', { fetchImpl: failing })
  expect(result).toMatchObject({ outcome: 'unreachable', ok: false })
  expect(result.message).toContain('Unable to connect')
})

test('reports a timeout', async () => {
  const hanging = ((_url: string, init: RequestInit) =>
    new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as unknown as typeof fetch
  const result = await testProviderConnection({ baseUrl: 'https://slow.example.com', apiKey: KEY }, 'claude', { fetchImpl: hanging, timeoutMs: 30 })
  expect(result.outcome).toBe('timeout')
})

test('sends nothing without a key', async () => {
  const seen: Array<{ url: string; init: RequestInit }> = []
  const result = await testProviderConnection({ baseUrl: 'https://api.example.com' }, 'claude', { fetchImpl: fakeFetch(200, '', seen) })
  expect(result).toMatchObject({ outcome: 'no-key', ok: false })
  expect(seen).toHaveLength(0)
})

test('a real relay-less request against a local server is classified by its status', async () => {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => Response.json({ error: { message: 'invalid x-api-key' } }, { status: 401 }) })
  try {
    const result = await testProviderConnection({ baseUrl: `http://127.0.0.1:${server.port}`, apiKey: KEY, authType: 'anthropic' }, 'claude')
    expect(result).toMatchObject({ outcome: 'key-rejected', statusCode: 401, message: 'invalid x-api-key' })
  } finally {
    server.stop(true)
  }
})
