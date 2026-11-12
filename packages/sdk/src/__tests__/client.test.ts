import { describe, test, expect } from 'bun:test'
import { StoreClient } from '../client'
import type { Item } from '@as/types'

describe('StoreClient constructor', () => {
  test('uses provided baseUrl', () => {
    const client = new StoreClient('https://store.example.com')
    expect(client.baseUrl).toBe('https://store.example.com')
  })

  test('defaults to http://localhost:3000', () => {
    const client = new StoreClient()
    expect(client.baseUrl).toBe('http://localhost:3000')
  })

  test('strips trailing slash from baseUrl', () => {
    const client = new StoreClient('https://store.example.com/')
    expect(client.baseUrl).toBe('https://store.example.com')
  })
})

// Minimal valid Item fixture for mocking
const fakeItem: Item = {
  id: 'item-1',
  slug: 'test-provider',
  name: 'Test Provider',
  description: 'A test provider',


  category: 'provider',
  version: '1.0.0',
  publisher: {
    id: 'pub-1',
    slug: 'test-publisher',
    name: 'Test Publisher',
    avatarUrl: 'https://example.com/avatar.png',
    tier: 'official',
  },
  compatibleWith: ['claude'],
  tags: ['ai'],
  downloads: 100,
  rating: 0,
  status: 'published',
  installHook: { steps: [] },
  createdAt: '2026-06-18T00:00:00Z',
  updatedAt: '2026-06-18T00:00:00Z',
  configSchema: {},
  supportedModels: ['gpt-4o'],
}

describe('StoreClient.getItems', () => {
  test('calls GET /api/items and returns items on success', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url: RequestInfo | URL) => {
      expect(String(url)).toBe('http://localhost:3000/api/items')
      return new Response(JSON.stringify({ items: [fakeItem] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const client = new StoreClient()
    const result = await client.getItems()
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1)
    expect(result.data![0].slug).toBe('test-provider')

    globalThis.fetch = originalFetch
  })

  test('appends query params when provided', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url: RequestInfo | URL) => {
      const u = new URL(String(url))
      expect(u.searchParams.get('category')).toBe('provider')
      expect(u.searchParams.get('q')).toBe('gpt')
      expect(u.searchParams.get('limit')).toBe('5')
      expect(u.searchParams.get('offset')).toBe('10')
      expect(u.searchParams.get('sort')).toBe('created')
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    }

    const client = new StoreClient()
    await client.getItems({ category: 'provider', q: 'gpt', limit: 5, offset: 10, sort: 'created' })

    globalThis.fetch = originalFetch
  })

  test('returns error string on non-200 response', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Failed to fetch items' }), { status: 500 })

    const client = new StoreClient()
    const result = await client.getItems()
    expect(result.data).toBeNull()
    expect(result.error).toBe('Failed to fetch items')

    globalThis.fetch = originalFetch
  })

  test('returns error string on network failure', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('Network error') }

    const client = new StoreClient()
    const result = await client.getItems()
    expect(result.data).toBeNull()
    expect(result.error).toBe('Network error')

    globalThis.fetch = originalFetch
  })

  test('returns error when response has no items field', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({}), { status: 200 })

    const client = new StoreClient()
    const result = await client.getItems()
    expect(result.data).toBeNull()
    expect(result.error).toBe('No items in response')

    globalThis.fetch = originalFetch
  })

  test('merges a passed fetchInit (e.g. custom header) into the fetch call', async () => {
    const originalFetch = globalThis.fetch
    let capturedInit: RequestInit | undefined
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    }) as typeof fetch

    const client = new StoreClient('http://localhost:3000', { fetchInit: { headers: { 'X-Test': 'yes' } } })
    await client.getItems()
    expect((capturedInit?.headers as Record<string, string> | undefined)?.['X-Test']).toBe('yes')

    globalThis.fetch = originalFetch
  })

  test('a timeoutMs shorter than a hanging fetch yields an error result', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted')))
      })) as typeof fetch

    const client = new StoreClient('http://localhost:3000', { timeoutMs: 10 })
    const result = await client.getItems()
    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()

    globalThis.fetch = originalFetch
  })
})

describe('StoreClient.getItemBySlug', () => {
  test('calls GET /api/items/:slug and returns item on success', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url: RequestInfo | URL) => {
      expect(String(url)).toBe('http://localhost:3000/api/items/test-provider')
      return new Response(JSON.stringify({ item: fakeItem }), { status: 200 })
    }

    const client = new StoreClient()
    const result = await client.getItemBySlug('test-provider')
    expect(result.error).toBeNull()
    expect(result.data?.slug).toBe('test-provider')

    globalThis.fetch = originalFetch
  })

  test('returns error string on 404', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

    const client = new StoreClient()
    const result = await client.getItemBySlug('no-such-slug')
    expect(result.data).toBeNull()
    expect(result.error).toBe('Not found')

    globalThis.fetch = originalFetch
  })
})

describe('StoreClient.getMyEntitlements', () => {
  test('sends the bearer token and returns the plan', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('http://localhost:3000/api/me/entitlements')
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-1')
      return new Response(JSON.stringify({ plan: 'pro' }), { status: 200 })
    }

    const client = new StoreClient()
    const result = await client.getMyEntitlements('tok-1')
    expect(result.data).toEqual({ plan: 'pro' })
    expect(result.error).toBeNull()

    globalThis.fetch = originalFetch
  })

  test('returns error on 401', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    const client = new StoreClient()
    const result = await client.getMyEntitlements('bad')
    expect(result.data).toBeNull()
    expect(result.error).toBe('Unauthorized')

    globalThis.fetch = originalFetch
  })
})

describe('StoreClient.createCheckout', () => {
  test('posts the period with the bearer token and returns the checkout url', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('http://localhost:3000/api/billing/checkout')
      expect(init?.method).toBe('POST')
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-1')
      expect(JSON.parse(String(init?.body))).toEqual({ period: 'yearly' })
      return new Response(JSON.stringify({ checkoutUrl: 'https://pay.example/cs_1' }), { status: 200 })
    }

    const client = new StoreClient()
    const result = await client.createCheckout({ period: 'yearly' }, { token: 'tok-1' })
    expect(result.data).toEqual({ checkoutUrl: 'https://pay.example/cs_1' })

    globalThis.fetch = originalFetch
  })

  test('returns error when billing is not configured (501)', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Billing not configured' }), { status: 501 })

    const client = new StoreClient()
    const result = await client.createCheckout({ period: 'monthly' })
    expect(result.data).toBeNull()
    expect(result.error).toBe('Billing not configured')

    globalThis.fetch = originalFetch
  })
})

describe('StoreClient resources', () => {
  function stub(handler: (url: string) => Response) {
    const original = globalThis.fetch
    const seen: string[] = []
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      seen.push(String(url))
      return handler(String(url))
    }) as typeof fetch
    return { seen, restore: () => (globalThis.fetch = original) }
  }

  test('listResources passes kind, q, sort, limit and offset to /api/resources', async () => {
    const f = stub(() => Response.json({ resources: [], nextOffset: 40 }))
    const result = await new StoreClient('https://s.example').listResources({ kind: 'mcp', q: ' git ', sort: 'installs', limit: 20, offset: 20 })
    f.restore()
    expect(f.seen[0]).toBe('https://s.example/api/resources?kind=mcp&q=git&sort=installs&limit=20&offset=20')
    expect(result).toEqual({ data: { resources: [], nextOffset: 40 }, error: null })
  })

  test('listResources leaves out the default sort and a zero offset', async () => {
    const f = stub(() => Response.json({ resources: [], nextOffset: null }))
    await new StoreClient('https://s.example').listResources({ sort: 'default', offset: 0 })
    f.restore()
    expect(f.seen[0]).toBe('https://s.example/api/resources')
  })

  test('listResources reports the HTTP status of an error', async () => {
    const f = stub(() => Response.json({ error: 'Catalog not loaded yet' }, { status: 503 }))
    const result = await new StoreClient('https://s.example').listResources()
    f.restore()
    expect(result).toEqual({ data: null, error: 'Catalog not loaded yet', status: 503 })
  })

  test('getResource encodes each segment of the id and keeps the slashes', async () => {
    const f = stub(() => Response.json({ resource: { id: 'github:o/r/s' } }))
    const result = await new StoreClient('https://s.example').getResource('github:o/r/s')
    f.restore()
    expect(f.seen[0]).toBe('https://s.example/api/resources/github%3Ao/r/s')
    expect(result.data?.id).toBe('github:o/r/s')
  })

  test('getResource returns status 404 for a missing id', async () => {
    const f = stub(() => Response.json({ error: 'Not found' }, { status: 404 }))
    const result = await new StoreClient('https://s.example').getResource('builtin:none')
    f.restore()
    expect(result).toEqual({ data: null, error: 'Not found', status: 404 })
  })
})
