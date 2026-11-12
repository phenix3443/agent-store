'use server'

import { listResources, PAGE_SIZE, type ListOutcome } from '@/lib/catalog'
import { parseStoreQuery, type StoreQuery } from '@/lib/resource'

// Server actions are public endpoints: the query is re-parsed rather than trusted.
export async function loadMoreResources(query: StoreQuery, offset: number): Promise<ListOutcome> {
  const safe = parseStoreQuery({ category: query?.kind ?? undefined, q: query?.q, sort: query?.sort })
  if (!Number.isSafeInteger(offset) || offset < 0) return { ok: false, error: 'Bad offset' }
  return listResources(safe, offset, PAGE_SIZE)
}
