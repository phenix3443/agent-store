import { test, expect, mock } from 'bun:test'
import type { Item } from '@as/types'

const mockItem: Item = {
  id: 'item-1', slug: 'openai-provider', name: 'OpenAI Provider',
  description: 'OpenAI API',
 category: 'provider', version: '1.0.0',
  publisher: { id: 'pub-1', slug: 'openai', name: 'OpenAI', avatarUrl: 'https://example.com/logo.png', tier: 'official' },
  compatibleWith: ['claude', 'codex'], tags: [], downloads: 1000, rating: 0,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  configSchema: {}, supportedModels: ['gpt-4o'],
}

let lastGetItemsOptions: { sort?: string; limit?: number; offset?: number } | null = null

mock.module('../queries', () => ({
  getItems: async (_env: unknown, options: { sort?: string; limit?: number; offset?: number }) => {
    lastGetItemsOptions = options
    return { data: [mockItem], error: null }
  },
  getItemBySlug: async (_env: unknown, slug: string) =>
    slug === 'openai-provider' ? { data: mockItem, error: null } : { data: null, error: null },
}))

const { app } = await import('../app')

test('GET / health check', async () => {
  const res = await app.fetch(new Request('http://localhost/'))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, service: 'as-api' })
})

test('GET /api/items returns { items }', async () => {
  const res = await app.fetch(new Request('http://localhost/api/items'))
  expect(res.status).toBe(200)
  const body = (await res.json()) as { items: Item[] }
  expect(body.items).toHaveLength(1)
  expect(body.items[0].slug).toBe('openai-provider')
})

test('GET /api/items defaults to the recommended sort', async () => {
  await app.fetch(new Request('http://localhost/api/items'))
  expect(lastGetItemsOptions?.sort).toBe('recommended')
})

test('GET /api/items passes through explicit ?sort=downloads and ?sort=created', async () => {
  await app.fetch(new Request('http://localhost/api/items?sort=downloads'))
  expect(lastGetItemsOptions?.sort).toBe('downloads')
  await app.fetch(new Request('http://localhost/api/items?sort=created'))
  expect(lastGetItemsOptions?.sort).toBe('created')
})

test('GET /api/items falls back to recommended for an unknown sort', async () => {
  await app.fetch(new Request('http://localhost/api/items?sort=bogus'))
  expect(lastGetItemsOptions?.sort).toBe('recommended')
})

test('GET /api/items sets CORS header', async () => {
  const res = await app.fetch(new Request('http://localhost/api/items'))
  expect(res.headers.get('access-control-allow-origin')).toBe('*')
})

test('GET /api/items/:slug returns { item }', async () => {
  const res = await app.fetch(new Request('http://localhost/api/items/openai-provider'))
  expect(res.status).toBe(200)
  const body = (await res.json()) as { item: Item }
  expect(body.item.slug).toBe('openai-provider')
})

test('GET /api/items/:slug returns 404 for unknown slug', async () => {
  const res = await app.fetch(new Request('http://localhost/api/items/nope'))
  expect(res.status).toBe(404)
})

// Publishing and topics were removed in #101.
test.each(['/api/publishers/openai', '/api/topics', '/api/topics/docs', '/api/me/items'])('GET %s is gone', async (path) => {
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

test('POST /api/items/:slug/reviews returns 401 without a token', async () => {
  const res = await app.fetch(
    new Request('http://localhost/api/items/some-slug/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating: 5 }),
    })
  )
  expect(res.status).toBe(401)
})
