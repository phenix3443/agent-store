import { afterEach, expect, test } from 'bun:test'
import { StoreClient } from '../client'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

type Seen = { url: string; init?: RequestInit }

function serve(status: number, body: unknown): Seen[] {
  const seen: Seen[] = []
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(url), init })
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
  return seen
}

const client = new StoreClient('https://store.test')

test('startDeviceAuth posts the client id and maps the RFC 8628 answer', async () => {
  const seen = serve(200, {
    device_code: 'dev-1',
    user_code: 'ABCDEFGH',
    verification_uri: 'https://store.test/auth/device',
    verification_uri_complete: 'https://store.test/auth/device?user_code=ABCDEFGH',
    expires_in: 600,
    interval: 5,
  })
  const result = await client.startDeviceAuth('agent-store-desktop')
  expect(result.data).toEqual({
    deviceCode: 'dev-1',
    userCode: 'ABCDEFGH',
    verificationUriComplete: 'https://store.test/auth/device?user_code=ABCDEFGH',
    expiresIn: 600,
    interval: 5,
  })
  expect(seen[0]?.url).toBe('https://store.test/api/auth/device/code')
  expect(seen[0]?.init?.method).toBe('POST')
  expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({ client_id: 'agent-store-desktop' })
})

test('startDeviceAuth reports a store without the endpoint as an error with its status', async () => {
  serve(404, { message: 'Not Found' })
  const result = await client.startDeviceAuth('agent-store-desktop')
  expect(result).toEqual({ data: null, error: 'Not Found', status: 404 })
})

test('pollDeviceAuth turns the RFC 8628 error codes into states', async () => {
  for (const [error, status] of [
    ['authorization_pending', 'pending'],
    ['slow_down', 'slow_down'],
    ['access_denied', 'denied'],
    ['expired_token', 'expired'],
    ['invalid_grant', 'expired'],
  ] as const) {
    serve(400, { error, error_description: 'x' })
    expect((await client.pollDeviceAuth('agent-store-desktop', 'dev-1')).data).toEqual({ status })
  }
})

test('pollDeviceAuth returns the new session once approved, and sends the grant type', async () => {
  const seen = serve(200, { access_token: 'sess-1', token_type: 'Bearer', expires_in: 604800, scope: '' })
  const result = await client.pollDeviceAuth('agent-store-desktop', 'dev-1')
  expect(result.data).toEqual({ status: 'approved', sessionToken: 'sess-1', expiresIn: 604800 })
  expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: 'dev-1',
    client_id: 'agent-store-desktop',
  })
})

test('getAccessToken sends the session as bearer and reads exp from the JWT', async () => {
  const payload = btoa(JSON.stringify({ sub: 'u1', exp: 1800000000 })).replace(/=+$/, '')
  const jwt = `eyJhbGciOiJFZERTQSJ9.${payload}.sig`
  const seen = serve(200, { token: jwt })
  const result = await client.getAccessToken('sess-1')
  expect(result.data).toEqual({ token: jwt, expiresAt: 1800000000 })
  expect(seen[0]?.url).toBe('https://store.test/api/auth/token')
  expect((seen[0]?.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer sess-1')
})

test('getAccessToken keeps the 401 status so callers can tell a revoked session', async () => {
  serve(401, { code: 'UNAUTHORIZED', message: 'Unauthorized' })
  expect(await client.getAccessToken('gone')).toEqual({ data: null, error: 'Unauthorized', status: 401 })
})

test('signOutSession posts to sign-out with the session as bearer', async () => {
  const seen = serve(200, { success: true })
  expect((await client.signOutSession('sess-1')).data).toEqual({ success: true })
  expect(seen[0]?.url).toBe('https://store.test/api/auth/sign-out')
  expect(seen[0]?.init?.method).toBe('POST')
  expect((seen[0]?.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer sess-1')
})

test('a network failure is an error without a status', async () => {
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed')
  }) as unknown as typeof fetch
  expect(await client.signOutSession('sess-1')).toEqual({ data: null, error: 'fetch failed' })
})
