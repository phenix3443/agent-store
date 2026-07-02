import { test, expect, mock } from 'bun:test'
import type { Item } from '@aas/types'

const mockItem: Item = {
  id: 'item-1', slug: 'openai-provider', name: 'OpenAI Provider',
  description: 'OpenAI API', readmeUrl: 'https://example.com/readme',
  icon: 'https://example.com/icon.png', category: 'provider', version: '1.0.0',
  publisher: { id: 'pub-1', slug: 'openai', name: 'OpenAI',
    avatarUrl: 'https://example.com/logo.png', tier: 'official' },
  compatibleWith: ['claude'], tags: [], downloads: 1000, rating: 0,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  configSchema: {}, supportedModels: ['gpt-4o'],
}

mock.module('@/lib/queries/items', () => ({
  getItems: async () => ({ data: [], error: null }),
  getItemBySlug: async (slug: string) => ({
    data: slug === 'openai-provider' ? mockItem : null,
    error: null,
  }),
  getFeaturedItems: async () => ({ data: [], error: null }),
  getNewItems: async () => ({ data: [], error: null }),
}))

import { GET } from '../route'

test('GET /api/items/[slug] returns item when found', async () => {
  const req = new Request('http://localhost/api/items/openai-provider') as unknown as import('next/server').NextRequest
  const res = await GET(req, { params: { slug: 'openai-provider' } })
  expect(res.status).toBe(200)
  const body = await res.json() as { item: Item }
  expect(body.item.slug).toBe('openai-provider')
})

test('GET /api/items/[slug] returns 404 when not found', async () => {
  const req = new Request('http://localhost/api/items/notexist') as unknown as import('next/server').NextRequest
  const res = await GET(req, { params: { slug: 'notexist' } })
  expect(res.status).toBe(404)
})
