import { Hono } from 'hono'
import type { ResourceKind, ResourceListResponse } from '@as/types'
import { CatalogUnavailableError, type CatalogReader, type ResourceSort } from './reader'

const KINDS = new Set<ResourceKind>(['skill', 'mcp', 'provider'])
const SORTS = new Set<ResourceSort>(['default', 'installs', 'stars', 'updated', 'name'])

/**
 * GET /api/resources?kind=&q=&sort=&limit=&offset=  list and search
 * GET /api/resources/<id>                            detail; ids contain '/' and ':', sent raw or encoded
 * Both read only catalog.db.
 */
export function resourceRoutes(reader: CatalogReader): Hono {
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
    const resource = reader.get(id)
    if (!resource) return c.json({ error: 'Not found' }, 404)
    return c.json({ resource })
  })

  return app
}
