import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getItems, getItemBySlug, getPublisherBySlug, getPublisherItems } from './queries'
import type { SupabaseEnv } from './supabase'

// On Cloudflare Workers, secrets arrive as the fetch handler's `env` (Hono c.env).
// On local Bun (Bun.serve), c.env is the Bun server object with no such keys, so
// getSupabase() falls back to process.env.
export const app = new Hono<{ Bindings: SupabaseEnv }>()

app.use('/api/*', cors())

app.get('/', (c) => c.json({ ok: true, service: 'as-api' }))

app.get('/api/items', async (c) => {
  const rawCategory = c.req.query('category')
  const category =
    rawCategory === 'provider' || rawCategory === 'skill' || rawCategory === 'mcp' ? rawCategory : null

  const { data, error } = await getItems(c.env, {
    category,
    q: c.req.query('q') ?? undefined,
    limit: Math.min(Number(c.req.query('limit') ?? '20'), 100),
    offset: Number(c.req.query('offset') ?? '0'),
    sort: c.req.query('sort') === 'created' ? 'created' : 'downloads',
  })

  if (error) return c.json({ error: 'Failed to fetch items' }, 500)
  return c.json({ items: data })
})

app.get('/api/items/:slug', async (c) => {
  const { data, error } = await getItemBySlug(c.env, c.req.param('slug'))
  if (error) return c.json({ error: 'Failed to fetch item' }, 500)
  if (!data) return c.json({ error: 'Not found' }, 404)
  return c.json({ item: data })
})

app.get('/api/publishers/:slug', async (c) => {
  const slug = c.req.param('slug')
  const [publisherResult, itemsResult] = await Promise.all([
    getPublisherBySlug(c.env, slug),
    getPublisherItems(c.env, slug),
  ])

  if (publisherResult.error) return c.json({ error: 'Failed to fetch publisher' }, 500)
  if (!publisherResult.data) return c.json({ error: 'Not found' }, 404)
  return c.json({ publisher: publisherResult.data, items: itemsResult.data })
})
