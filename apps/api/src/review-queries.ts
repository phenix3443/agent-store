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
 * Returns null when the item does not exist.
 *
 * The item row is locked first, so reviews of one item run one at a time. Without
 * the lock, computing the aggregate in SQL inside a transaction is not enough: a
 * second transaction's UPDATE waits for the first to commit, then evaluates its
 * subqueries against the snapshot it took before that commit and misses the
 * other review (8 concurrent reviews counted as 5 in the integration test).
 */
export async function submitReview(
  env: DbEnv | undefined,
  input: ReviewInput
): Promise<{ rating: number; reviewCount: number } | null> {
  const db = getDb(env)
  const updated = await db.transaction(async (tx) => {
    const locked = await tx.select({ slug: items.slug }).from(items).where(eq(items.slug, input.slug)).for('update')
    if (locked.length === 0) return []
    await tx
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
      })
    return tx
      .update(items)
      .set({
        rating: sql`coalesce((select round(avg(r.rating)::numeric, 1) from reviews r where r.item_slug = ${input.slug}), 0)`,
        reviewCount: sql`(select count(*)::int from reviews r where r.item_slug = ${input.slug})`,
      })
      .where(eq(items.slug, input.slug))
      .returning({ rating: items.rating, reviewCount: items.reviewCount })
  })
  const row = updated[0]
  return row ? { rating: Number(row.rating), reviewCount: row.reviewCount } : null
}
