import type { ResourceDetail, ResourceKind, ResourceSummary, SearchSupplementResponse } from '@as/types'
import { StoreClient } from '@as/sdk'
import type { StoreQuery } from './resource'

// Web store and CLI share one catalog source: the standalone apps/api server.
// Point at it via API_URL (set in dev/Makefile and production config); fall back
// to the public var, then the local api-server dev port.
const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

// revalidate: 300s balances catalog freshness against serving stale-but-cached data
// (via Next's Data Cache) when the API server is briefly unreachable.
const client = new StoreClient(API_URL, { fetchInit: { next: { revalidate: 300 } } as RequestInit })
// The supplement endpoint holds a request up to 10 s while a lookup runs.
const live = new StoreClient(API_URL, { fetchInit: { cache: 'no-store' }, timeoutMs: 15_000 })
const probe = new StoreClient(API_URL, { fetchInit: { next: { revalidate: 300 } } as RequestInit, timeoutMs: 3_000 })

export const PAGE_SIZE = 50

export type ListOutcome =
  | { ok: true; resources: ResourceSummary[]; nextOffset: number | null }
  | { ok: false; error: string }

export async function listResources(query: StoreQuery, offset = 0, limit = PAGE_SIZE): Promise<ListOutcome> {
  const { data, error } = await client.listResources({
    kind: query.kind ?? undefined,
    q: query.q,
    sort: query.sort,
    limit,
    offset,
  })
  if (!data) return { ok: false, error }
  return { ok: true, resources: data.resources, nextOffset: data.nextOffset }
}

/** Null when the id does not exist; throws on any other failure so the error page shows. */
export async function getResource(id: string): Promise<ResourceDetail | null> {
  const result = await client.getResource(id)
  if (result.data) return result.data
  if (result.status === 404) return null
  throw new Error(`Catalog unavailable: ${result.error}`)
}

/**
 * Whether this deployment looks queries up on other skill directories. Asked with an
 * empty query, which the API never sends anywhere.
 */
export async function supplementEnabled(): Promise<boolean> {
  const { data } = await probe.searchSupplement({ q: '' })
  return data !== null && data.status !== 'disabled'
}

/** Starts or joins a lookup on other skill directories; only after the visitor agreed to send the query. */
export async function searchSupplement(q: string, kind: ResourceKind | null, wait: number): Promise<SearchSupplementResponse | null> {
  const { data } = await live.searchSupplement({ q, kind: kind ?? undefined, wait })
  return data
}
