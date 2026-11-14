import type { ResourceSummary } from '@as/types'
import { getTranslations } from 'next-intl/server'
import { listResources, supplementEnabled, type ListOutcome } from '@/lib/catalog'
import { parseStoreQuery } from '@/lib/resource'
import { CatalogSources, HotList } from '@/components/HotList'
import { ResourceList } from '@/components/ResourceList'
import { ResourceRowsSkeleton } from '@/components/ResourceRows'
import type { SupplementView } from '@/components/StoreSupplement'
import { ListHeading, StoreError, StoreHero } from '@/components/StoreToolbar'

const REVIEW_SUPPLEMENT: SupplementView[] = ['offer', 'searching', 'none', 'unavailable']

interface StorePageProps {
  searchParams: Promise<{
    category?: string
    q?: string
    sort?: string
    /** loading | empty | error: opens that state for screenshots and review. */
    state?: string
    /** With `state`: opens that state of the search supplement. */
    supplement?: string
  }>
}

export default async function StorePage({ searchParams }: StorePageProps) {
  const sp = await searchParams
  const query = parseStoreQuery(sp)
  const filtered = Boolean(query.q) || query.kind !== null || query.sort !== 'default'
  const review = sp.state !== undefined
  const t = await getTranslations('store')

  let result: ListOutcome | null = null
  if (sp.state === 'error') result = { ok: false, error: 'state=error' }
  else if (sp.state === 'empty') result = { ok: true, resources: [], nextOffset: null }
  else if (sp.state !== 'loading') result = await listResources(query)

  let hot: ResourceSummary[] = []
  if (!filtered && !review) {
    const top = await listResources({ kind: null, q: '', sort: 'installs' }, 0, 4)
    if (top.ok) hot = top.resources
  }
  const supplement =
    !review && Boolean(query.q) && query.kind !== 'mcp' && query.kind !== 'provider' && result?.ok === true && (await supplementEnabled().catch(() => false))
  const supplementReview = review && REVIEW_SUPPLEMENT.includes(sp.supplement as SupplementView) ? (sp.supplement as SupplementView) : undefined

  const params = new URLSearchParams()
  if (query.kind) params.set('category', query.kind)
  if (query.q) params.set('q', query.q)
  if (query.sort !== 'default') params.set('sort', query.sort)
  const href = params.toString() ? `/store?${params}` : '/store'
  const title = query.q ? t('list.results', { q: query.q }) : query.kind ? t(`categories.${query.kind}`) : t('list.all')

  return (
    <div className="store-shell pb-4">
      <div className="mx-auto w-[min(1160px,calc(100%-2*clamp(16px,4vw,32px)))]">
        <StoreHero category={query.kind ?? 'all'} sort={query.sort} />
        <HotList resources={hot} />
        {result === null ? (
          <>
            <ListHeading title={title} filtered={filtered}>
              <span className="label">{t('list.loading')}</span>
            </ListHeading>
            <ResourceRowsSkeleton />
          </>
        ) : !result.ok ? (
          <>
            <ListHeading title={title} filtered={filtered} />
            <StoreError retryHref={href} />
          </>
        ) : (
          <ResourceList
            key={href}
            query={query}
            initial={result.resources}
            initialNextOffset={result.nextOffset}
            title={title}
            filtered={filtered}
            supplement={supplement}
            supplementReview={supplementReview}
          />
        )}
        <CatalogSources />
      </div>
    </div>
  )
}
