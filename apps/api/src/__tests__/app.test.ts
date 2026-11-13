import { test, expect } from 'bun:test'

const { app } = await import('../app')

test('GET / health check', async () => {
  const res = await app.fetch(new Request('http://localhost/'))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, service: 'as-api' })
})

// Publishing and topics were removed in #101; items, reviews and versions with them.
test.each([
  '/api/publishers/openai',
  '/api/topics',
  '/api/topics/docs',
  '/api/me/items',
  '/api/items',
  '/api/items/openai-provider',
  '/api/items/openai-provider/reviews',
  '/api/items/openai-provider/versions',
])('GET %s is gone', async (path) => {
  const res = await app.fetch(new Request(`http://localhost${path}`))
  expect(res.status).toBe(404)
})

test('POST /api/webhooks/waffo rejects a bad signature with 401', async () => {
  const res = await app.fetch(
    new Request('http://localhost/api/webhooks/waffo', {
      method: 'POST',
      headers: { 'x-waffo-signature': 'not-a-real-signature' },
      body: JSON.stringify({ id: 'DLV_1', eventType: 'subscription.activated' }),
    })
  )
  expect(res.status).toBe(401)
})

test('POST /api/billing/checkout returns 501 when billing is not configured', async () => {
  const res = await app.fetch(
    new Request('http://localhost/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ period: 'monthly' }),
    })
  )
  expect(res.status).toBe(501)
})

test('GET /api/entitlements requires an email', async () => {
  const res = await app.fetch(new Request('http://localhost/api/entitlements'))
  expect(res.status).toBe(400)
})

test('GET /api/me/entitlements returns 401 without a bearer token', async () => {
  const res = await app.fetch(new Request('http://localhost/api/me/entitlements'))
  expect(res.status).toBe(401)
})

test('/api/* sets the CORS header', async () => {
  const res = await app.fetch(new Request('http://localhost/api/entitlements'))
  expect(res.headers.get('access-control-allow-origin')).toBe('*')
})
