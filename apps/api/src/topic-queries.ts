import type { Topic, TopicSummary } from '@as/types'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { getDb, type DbEnv } from './db/client'
import { items, publishers, topics } from './db/schema'
import { mapItem } from './db-types'

export async function getTopics(env: DbEnv | undefined): Promise<{ data: TopicSummary[]; error: string | null }> {
  try {
    const db = getDb(env)
    const rows = await db
      .select({
        slug: topics.slug,
        title: topics.title,
        description: topics.description,
        packageCount: sql<number>`(
          select count(*)::int from ${items}
          where ${items.slug} = any(${topics.packages}) and ${items.status} = 'published'
        )`,
      })
      .from(topics)
      .orderBy(asc(topics.slug))
    return { data: rows, error: null }
  } catch (e) {
    return { data: [], error: (e as Error).message ?? 'Query failed' }
  }
}

// Rows come back in arbitrary order; this puts them in the order of `slugs` and
// drops slugs with no row.
function inOrder<T extends { slug: string }>(slugs: string[], rows: T[]): T[] {
  const bySlug = new Map(rows.map((r) => [r.slug, r]))
  return slugs.flatMap((s) => bySlug.get(s) ?? [])
}

export async function getTopicBySlug(
  env: DbEnv | undefined,
  slug: string
): Promise<{ data: Topic | null; error: string | null }> {
  try {
    const db = getDb(env)
    const [topic] = await db.select().from(topics).where(eq(topics.slug, slug)).limit(1)
    if (!topic) return { data: null, error: null }

    const [itemRows, relatedRows] = await Promise.all([
      topic.packages.length === 0
        ? []
        : db
            .select()
            .from(items)
            .innerJoin(publishers, eq(items.publisherId, publishers.id))
            .where(and(inArray(items.slug, topic.packages), eq(items.status, 'published'))),
      topic.related.length === 0
        ? []
        : db.select({ slug: topics.slug, title: topics.title }).from(topics).where(inArray(topics.slug, topic.related)),
    ])

    const packages = inOrder(
      topic.packages,
      itemRows.map((r) => mapItem({ ...r.items, publisher: r.publishers }))
    )
    return {
      data: {
        slug: topic.slug,
        title: topic.title,
        description: topic.description,
        intro: topic.intro,
        capabilities: topic.capabilities,
        packages,
        related: inOrder(topic.related, relatedRows),
      },
      error: null,
    }
  } catch (e) {
    return { data: null, error: (e as Error).message ?? 'Query failed' }
  }
}
