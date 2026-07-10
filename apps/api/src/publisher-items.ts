import type { Item } from '@as/types'
import { desc, eq } from 'drizzle-orm'
import { getDb, type Database, type DbEnv } from './db/client'
import { items, publishers } from './db/schema'
import { mapItem } from './db-types'

async function resolvePublisherId(db: Database, username: string): Promise<string | null> {
  const rows = await db.select({ id: publishers.id }).from(publishers).where(eq(publishers.slug, username)).limit(1)
  return rows[0]?.id ?? null
}

/** Returns all items for the authenticated publisher (any status), newest first. */
export async function getMyItems(env: DbEnv | undefined, username: string): Promise<{ data: Item[]; error: string | null }> {
  try {
    const db = getDb(env)
    const publisherId = await resolvePublisherId(db, username)
    if (!publisherId) return { data: [], error: null }
    const rows = await db
      .select()
      .from(items)
      .innerJoin(publishers, eq(items.publisherId, publishers.id))
      .where(eq(items.publisherId, publisherId))
      .orderBy(desc(items.createdAt))
    return { data: rows.map((r) => mapItem({ ...r.items, publisher: r.publishers })), error: null }
  } catch (e) {
    return { data: [], error: (e as Error).message ?? 'Query failed' }
  }
}
