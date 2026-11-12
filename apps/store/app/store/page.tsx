import { listResources, type ListOutcome } from '@/lib/catalog'
import { parseStoreQuery } from '@/lib/resource'
import { ItemTableSkeleton } from '@/components/ItemTable'
import { ResourceList } from '@/components/ResourceList'
import { ClearFiltersLink, StoreError, StoreHeading, StoreToolbar } from '@/components/StoreToolbar'

interface StorePageProps {
  searchParams: Promise<{
    category?: string
    q?: string
    sort?: string
    /** loading | empty | error: opens that state for screenshots and review. */
    state?: string
  }>
}

export default async function StorePage({ searchParams }: StorePageProps) {
  const sp = await searchParams
  const query = parseStoreQuery(sp)
  const filtered = Boolean(query.q) || query.kind !== null

  let result: ListOutcome | null = null
  if (sp.state === 'error') result = { ok: false, error: 'state=error' }
  else if (sp.state === 'empty') result = { ok: true, resources: [], nextOffset: null }
  else if (sp.state !== 'loading') result = await listResources(query)

  const params = new URLSearchParams()
  if (query.kind) params.set('category', query.kind)
  if (query.q) params.set('q', query.q)
  if (query.sort !== 'default') params.set('sort', query.sort)
  const href = params.toString() ? `/store?${params}` : '/store'

  return (
    <div className="store-shell px-4 pb-16 lg:px-10">
      <StoreHeading />
      <StoreToolbar category={query.kind ?? 'all'} sort={query.sort} filtered={filtered} />
      {result === null ? (
        <ItemTableSkeleton />
      ) : !result.ok ? (
        <StoreError retryHref={href} />
      ) : (
        <ResourceList
          key={href}
          query={query}
          initial={result.resources}
          initialNextOffset={result.nextOffset}
          emptyAction={<ClearFiltersLink />}
        />
      )}
    </div>
  )
}
