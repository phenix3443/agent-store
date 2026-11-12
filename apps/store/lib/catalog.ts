import type { ResourceDetail, ResourceSummary } from '@as/types'
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
