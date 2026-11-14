import { Hono } from 'hono'
import type { ResourceKind, ResourceListResponse, SearchSupplementResponse } from '@as/types'
import { CatalogUnavailableError, type CatalogReader, type ResourceSort } from './reader'
import type { SearchSupplement } from './supplement'

const KINDS = new Set<ResourceKind>(['skill', 'mcp', 'provider'])
const SORTS = new Set<ResourceSort>(['default', 'installs', 'stars', 'updated', 'name'])

/** Longest a supplement request is held for a running lookup. */
const MAX_WAIT_SECONDS = 10

/**
 * GET /api/resources?kind=&q=&sort=&limit=&offset=  list and search; reads only catalog.db
 * GET /api/resources/<id>                            detail; ids contain '/' and ':', sent raw or encoded
 * GET /api/search/supplement?q=&kind=&wait=          what other skill directories list for a query
 *                                                    the catalog answers poorly (see supplement.ts)
 * GET /api/discovery/export                          stored finds, for the catalog sync
 * `supplement` returns null when the lookups are switched off (the default) or app.db is
 * missing; the supplement endpoint then answers `disabled`.
 */
export function resourceRoutes(reader: CatalogReader, supplement: () => SearchSupplement | null = () => null): Hono {
  const app = new Hono()

  app.onError((e, c) => {
    if (e instanceof CatalogUnavailableError) return c.json({ error: 'Catalog not loaded yet' }, 503)
    throw e
  })

  app.get('/api/resources', (c) => {
    const kind = c.req.query('kind')
    if (kind && !KINDS.has(kind as ResourceKind)) return c.json({ error: 'kind must be skill, mcp or provider' }, 400)
    const sort = c.req.query('sort') ?? 'default'
    if (!SORTS.has(sort as ResourceSort)) return c.json({ error: 'sort must be default, installs, stars, updated or name' }, 400)
    const num = (raw: string | undefined, fallback: number) => (raw === undefined || raw === '' ? fallback : /^\d+$/.test(raw) ? Number(raw) : NaN)
    const limit = num(c.req.query('limit'), 20)
    const offset = num(c.req.query('offset'), 0)
    if (!(limit >= 1)) return c.json({ error: 'limit must be a positive integer' }, 400)
    if (!(offset >= 0)) return c.json({ error: 'offset must be a non-negative integer' }, 400)
    const body: ResourceListResponse = reader.list({
      kind: (kind as ResourceKind) || null,
      q: c.req.query('q') ?? '',
      sort: sort as ResourceSort,
      limit: Math.min(limit, 100),
      offset,
    })
    return c.json(body)
  })

  app.get('/api/resources/*', (c) => {
    const raw = c.req.path.slice('/api/resources/'.length)
    let id: string
    try {
      id = decodeURIComponent(raw)
    } catch {
      return c.json({ error: 'Malformed id' }, 400)
    }
    // A skill scanned after a lookup is served from app.db until a catalog build holds it.
    const resource = reader.get(id) ?? supplement()?.resource(id) ?? null
    if (!resource) return c.json({ error: 'Not found' }, 404)
    return c.json({ resource })
  })

  app.get('/api/search/supplement', async (c) => {
    const kind = c.req.query('kind')
    if (kind && !KINDS.has(kind as ResourceKind)) return c.json({ error: 'kind must be skill, mcp or provider' }, 400)
    const raw = c.req.query('wait') ?? '0'
    if (!/^\d+$/.test(raw)) return c.json({ error: 'wait must be a non-negative integer (seconds)' }, 400)
    const q = c.req.query('q') ?? ''
    c.header('cache-control', 'no-store')
    const s = supplement()
    if (!s) {
      const off: SearchSupplementResponse = { status: 'disabled', sources: [], reason: null, resources: [], listings: [], foundOn: {}, partial: false, retryAfterSeconds: null }
      return c.json(off)
    }
    let body = s.lookup(q, (kind as ResourceKind) || null)
    const wait = Math.min(Number(raw), MAX_WAIT_SECONDS)
    if (body.status === 'searching' && wait > 0) {
      await s.settled(q, wait * 1000)
      body = s.lookup(q, (kind as ResourceKind) || null)
    }
    return c.json(body)
  })

  app.get('/api/discovery/export', (c) => {
    const s = supplement()
    return c.json(s ? s.exportFinds() : { generatedAt: new Date().toISOString(), listings: [], repos: [] })
  })

  return app
}
