import { Hono, type Context } from 'hono'
import { and, count, desc, eq } from 'drizzle-orm'
import type { FavoriteEntry, FavoritesResponse, ResourceSummary } from '@as/types'
import type { AuthUser } from './auth'
import type { Database } from './db/client'
import { favorites } from './db/schema'
import type { CatalogReader } from './catalog/reader'
import type { SearchSupplement } from './catalog/supplement'

export const MAX_FAVORITES = 500

// A catalog id: `<site>:<upstream id>`, the same shape the desktop client accepts in an install link.
const ID = /^(mcp-registry|github|builtin):[A-Za-z0-9._~@/-]{1,300}$/

export interface FavoriteDeps {
  db: (c: Context) => Database
  user: (c: Context) => Promise<AuthUser | null>
  reader: CatalogReader
  supplement?: () => SearchSupplement | null
}

// drizzle wraps driver errors in DrizzleQueryError, keeping the bun:sqlite one as `cause`.
function isForeignKeyError(e: unknown): boolean {
  for (let cur = e, depth = 0; cur && depth < 3; cur = (cur as { cause?: unknown }).cause, depth++) {
    const { code, message } = cur as { code?: unknown; message?: unknown }
    if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || /FOREIGN KEY constraint/i.test(String(message ?? ''))) return true
  }
  return false
}

function summaryOf(deps: FavoriteDeps, ids: string[]): Map<string, ResourceSummary> {
  let found = new Map<string, ResourceSummary>()
  if (deps.reader.ready) found = deps.reader.summaries(ids)
  const s = deps.supplement?.()
  for (const id of ids) {
    if (found.has(id)) continue
    const extra = s?.resource(id)
    if (extra) found.set(id, extra)
  }
  return found
}

/**
 * GET    /api/me/favorites       the signed-in user's favorites, newest first
 * PUT    /api/me/favorites/<id>  add; adding one already saved is a no-op
 * DELETE /api/me/favorites/<id>  remove; removing one not saved is a no-op
 * Ids hold ':' and '/', sent raw or encoded per segment. All three need a bearer token.
 */
export function favoriteRoutes(deps: FavoriteDeps): Hono {
  const app = new Hono()

  app.use('/api/me/favorites', async (c, next) => {
    c.header('cache-control', 'no-store')
    await next()
  })
  app.use('/api/me/favorites/*', async (c, next) => {
    c.header('cache-control', 'no-store')
    await next()
  })

  app.get('/api/me/favorites', async (c) => {
    const user = await deps.user(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    const rows = deps
      .db(c)
      .select({ id: favorites.resourceId, createdAt: favorites.createdAt })
      .from(favorites)
      .where(eq(favorites.userId, user.id))
      .orderBy(desc(favorites.createdAt), favorites.resourceId)
      .all()
    const summaries = summaryOf(deps, rows.map((r) => r.id))
    const body: FavoritesResponse = {
      favorites: rows.map(
        (r): FavoriteEntry => ({ id: r.id, createdAt: r.createdAt.toISOString(), resource: summaries.get(r.id) ?? null })
      ),
    }
    return c.json(body)
  })

  function idOf(c: Context): string | null {
    try {
      const id = decodeURIComponent(c.req.path.slice('/api/me/favorites/'.length))
      return ID.test(id) ? id : null
    } catch {
      return null
    }
  }

  app.put('/api/me/favorites/*', async (c) => {
    const user = await deps.user(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    const id = idOf(c)
    if (!id) return c.json({ error: 'Malformed id' }, 400)
    // Only checked once the catalog is loaded: before that every id would look unknown.
    if (deps.reader.ready && !summaryOf(deps, [id]).has(id)) return c.json({ error: 'Not found' }, 404)
    const db = deps.db(c)
    let outcome: 'ok' | 'full'
    try {
      outcome = db.transaction(
        (tx) => {
          const saved = tx
            .select({ id: favorites.resourceId })
            .from(favorites)
            .where(and(eq(favorites.userId, user.id), eq(favorites.resourceId, id)))
            .get()
          if (saved) return 'ok' as const
          const [row] = tx.select({ n: count() }).from(favorites).where(eq(favorites.userId, user.id)).all()
          if ((row?.n ?? 0) >= MAX_FAVORITES) return 'full' as const
          tx.insert(favorites).values({ userId: user.id, resourceId: id }).run()
          return 'ok' as const
        },
        { behavior: 'immediate' }
      )
    } catch (e) {
      // A valid token whose user row is gone: the account was deleted after the token was minted.
      if (isForeignKeyError(e)) return c.json({ error: 'Unauthorized' }, 401)
      throw e
    }
    if (outcome === 'full') return c.json({ error: `At most ${MAX_FAVORITES} favorites` }, 409)
    return c.json({ id, favorited: true })
  })

  app.delete('/api/me/favorites/*', async (c) => {
    const user = await deps.user(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    const id = idOf(c)
    if (!id) return c.json({ error: 'Malformed id' }, 400)
    deps
      .db(c)
      .delete(favorites)
      .where(and(eq(favorites.userId, user.id), eq(favorites.resourceId, id)))
      .run()
    return c.json({ id, favorited: false })
  })

  return app
}
