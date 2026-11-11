import { eq, sql } from 'drizzle-orm'
import { getDb, type DbEnv } from './db/client'
import { items, reviews } from './db/schema'

export type ReviewInput = {
  slug: string
  userId: string
  authorName: string | null
  rating: number
  body: string | null
}

/**
 * Upserts the caller's review and recomputes the item's rating + review_count.
 * Both statements run in one batch (a single transaction), and the aggregate is
 * computed in SQL from the committed rows, so concurrent reviews cannot overwrite
 * each other's totals. Returns null when the item does not exist.
 */
export async function submitReview(
  env: DbEnv | undefined,
  input: ReviewInput
): Promise<{ rating: number; reviewCount: number } | null> {
  const db = getDb(env)
  const [, updated] = await db.batch([
    db
      .insert(reviews)
      .values({
        itemSlug: input.slug,
        userId: input.userId,
        authorName: input.authorName,
        rating: input.rating,
        body: input.body,
      })
      // reviews has no updated_at trigger (only items/subscriptions do), so set it
      // explicitly on the conflict-update path; fresh inserts default it to now().
      .onConflictDoUpdate({
        target: [reviews.itemSlug, reviews.userId],
        set: { authorName: input.authorName, rating: input.rating, body: input.body, updatedAt: sql`now()` },
      }),
    db
      .update(items)
      .set({
        rating: sql`coalesce((select round(avg(r.rating)::numeric, 1) from reviews r where r.item_slug = ${input.slug}), 0)`,
        reviewCount: sql`(select count(*)::int from reviews r where r.item_slug = ${input.slug})`,
      })
      .where(eq(items.slug, input.slug))
      .returning({ rating: items.rating, reviewCount: items.reviewCount }),
  ])
  const row = updated[0]
  return row ? { rating: Number(row.rating), reviewCount: row.reviewCount } : null
}
