import type { Item, Publisher } from '@as/types'
import { AASClient } from '@as/sdk'

// Web store and CLI share one catalog source: the standalone apps/api server.
// Point at it via API_URL (set in dev/Makefile and production config); fall back
// to the public var, then the local api-server dev port.
const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

// revalidate: 300s balances catalog freshness against serving stale-but-cached data
// (via Next's Data Cache) when the API server is briefly unreachable.
const client = new AASClient(API_URL, { fetchInit: { next: { revalidate: 300 } } as RequestInit })

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

export async function getFeaturedItems(): Promise<Item[]> {
  const { data } = await client.getItems({ sort: 'downloads', limit: 6 })
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
