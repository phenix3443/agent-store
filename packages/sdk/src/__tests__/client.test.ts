import { describe, test, expect } from 'bun:test'
import { StoreClient } from '../client'

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

describe('StoreClient fetch options', () => {
  test('merges a passed fetchInit (e.g. custom header) into the fetch call', async () => {
    const originalFetch = globalThis.fetch
    let capturedInit: RequestInit | undefined
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init
      return new Response(JSON.stringify({ resources: [], nextOffset: null }), { status: 200 })
    }) as typeof fetch

    const client = new StoreClient('http://localhost:3000', { fetchInit: { headers: { 'X-Test': 'yes' } } })
    await client.listResources()
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
    const result = await client.listResources()
    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()

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

describe('StoreClient.searchSupplement', () => {
  test('sends the trimmed query, kind and wait, and returns the supplement', async () => {
    const originalFetch = globalThis.fetch
    const body = { status: 'found', reason: 'no_results', resources: [], listings: [], partial: false, retryAfterSeconds: null }
    globalThis.fetch = async (url: RequestInfo | URL) => {
      expect(String(url)).toBe('http://localhost:3000/api/search/supplement?q=terraform+plan&kind=skill&wait=5')
      return new Response(JSON.stringify(body), { status: 200 })
    }

    const result = await new StoreClient().searchSupplement({ q: ' terraform plan ', kind: 'skill', wait: 5 })
    expect(result.data).toEqual(body)

    globalThis.fetch = originalFetch
  })

  test('a body that is not a supplement is an error', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({ resources: [] }), { status: 200 })

    const result = await new StoreClient().searchSupplement({ q: 'terraform' })
    expect(result.data).toBeNull()
    expect(result.error).toBe('Malformed supplement response')

    globalThis.fetch = originalFetch
  })
})

describe('StoreClient favorites', () => {
  test('listFavorites sends the token and returns the list', async () => {
    const originalFetch = globalThis.fetch
    let seen: { url: string; auth?: string } | undefined
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      seen = { url: String(url), auth: (init?.headers as Record<string, string>)['Authorization'] }
      return new Response(JSON.stringify({ favorites: [{ id: 'github:a/b/c', createdAt: '2026-11-14T00:00:00.000Z', resource: null }] }))
    }) as typeof fetch
    const result = await new StoreClient('https://api.example').listFavorites('jwt')
    globalThis.fetch = originalFetch
    expect(seen).toEqual({ url: 'https://api.example/api/me/favorites', auth: 'Bearer jwt' })
    expect(result.data?.favorites[0]?.id).toBe('github:a/b/c')
  })

  test('setFavorite PUTs to add and DELETEs to remove, encoding each id segment', async () => {
    const originalFetch = globalThis.fetch
    const calls: string[] = []
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method} ${String(url)}`)
      return new Response(JSON.stringify({ favorited: init?.method === 'PUT' }))
    }) as typeof fetch
    const client = new StoreClient('https://api.example')
    const on = await client.setFavorite('jwt', 'mcp-registry:io.github.x/y z', true)
    const off = await client.setFavorite('jwt', 'mcp-registry:io.github.x/y z', false)
    globalThis.fetch = originalFetch
    expect(calls).toEqual([
      'PUT https://api.example/api/me/favorites/mcp-registry%3Aio.github.x/y%20z',
      'DELETE https://api.example/api/me/favorites/mcp-registry%3Aio.github.x/y%20z',
    ])
    expect(on.data?.favorited).toBe(true)
    expect(off.data?.favorited).toBe(false)
  })

  test('an HTTP error keeps its status', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch
    const result = await new StoreClient('https://api.example').setFavorite('jwt', 'github:a/b/c', true)
    globalThis.fetch = originalFetch
    expect(result).toEqual({ data: null, error: 'Unauthorized', status: 401 })
  })
})
