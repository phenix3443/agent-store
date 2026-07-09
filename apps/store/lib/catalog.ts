import type { Item, Publisher } from '@as/types'
import { StoreClient } from '@as/sdk'

// Web store and CLI share one catalog source: the standalone apps/api server.
// Point at it via API_URL (set in dev/Makefile and production config); fall back
// to the public var, then the local api-server dev port.
const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

// revalidate: 300s balances catalog freshness against serving stale-but-cached data
// (via Next's Data Cache) when the API server is briefly unreachable.
const client = new StoreClient(API_URL, { fetchInit: { next: { revalidate: 300 } } as RequestInit })

export interface GetItemsOptions {
  category?: 'provider' | 'skill' | 'mcp' | null
  q?: string
  sort?: 'downloads' | 'created' | 'rating'
}

export async function getItems(options: GetItemsOptions = {}): Promise<Item[]> {
  const { category, q, sort = 'downloads' } = options
  const { data } = await client.getItems({
    category: category ?? undefined,
    q,
    // The API sorts by downloads or created; rating is sorted in memory below.
    sort: sort === 'created' ? 'created' : 'downloads',
    limit: 100,
  })
  const items = data ?? []
  if (sort === 'rating') return items.slice().sort((a, b) => b.rating - a.rating)
  return items
}

// Feature the best packages, not just the most-downloaded: weight publisher tier
// and the review quality score, with (dampened) downloads as a tiebreaker.
const TIER_WEIGHT: Record<string, number> = { official: 100, verified: 60, community: 0 }

function featuredScore(item: Item): number {
  return (
    (TIER_WEIGHT[item.publisher.tier] ?? 0) +
    (item.review?.quality ?? 0) * 10 +
    Math.log10((item.downloads ?? 0) + 1) * 5 -
    (item.review?.risk === 'medium' ? 20 : 0)
  )
}

export async function getFeaturedItems(): Promise<Item[]> {
  const { data } = await client.getItems({ sort: 'downloads', limit: 100 })
  const items = data ?? []
  return items
    .slice()
    .sort((a, b) => featuredScore(b) - featuredScore(a))
    .slice(0, 6)
}

export async function getItemVersions(slug: string) {
  const { data } = await client.getVersions(slug)
  return data ?? []
}

export async function getItemBySlug(slug: string): Promise<Item | null> {
  const { data } = await client.getItemBySlug(slug)
  return data ?? null
}

export async function getPublisherWithItems(
  slug: string
): Promise<{ publisher: Publisher; items: Item[] } | null> {
  const { data } = await client.getPublisher(slug)
  if (!data?.publisher) return null
  return { publisher: data.publisher, items: data.items ?? [] }
}
