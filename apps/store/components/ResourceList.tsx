'use client'

import type { ExternalSite, ResourceSummary } from '@as/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { loadMoreResources } from '@/app/store/actions'
import type { StoreQuery } from '@/lib/resource'
import { offerSupplement } from '@/lib/supplement'
import { ResourceRows } from './ResourceRows'
import { StoreSupplement, type SupplementView } from './StoreSupplement'
import { ClearFiltersLink, ListHeading } from './StoreToolbar'

// Scrolling loads pages by itself up to this many rows; past it the button
// does, so the footer stays reachable.
const AUTO_LOAD_LIMIT = 200

interface ResourceListProps {
  query: StoreQuery
  initial: ResourceSummary[]
  initialNextOffset: number | null
  title: string
  filtered: boolean
  /** The skill directories this deployment would send the query to; empty when the supplement is off. */
  supplementSources: ExternalSite[]
  supplementReview?: SupplementView
}

/**
 * The first page comes from the server render; later pages through a server
 * action, so the browser never talks to the API directly. Remounted (by key)
 * whenever the query changes.
 */
export function ResourceList({ query, initial, initialNextOffset, title, filtered, supplementSources, supplementReview }: ResourceListProps) {
  const t = useTranslations('store.list')
  const [resources, setResources] = useState(initial)
  const [nextOffset, setNextOffset] = useState(initialNextOffset)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const sentinel = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (nextOffset === null || busy.current) return
    busy.current = true
    setPending(true)
    setFailed(false)
    const page = await loadMoreResources(query, nextOffset).catch(() => null)
    busy.current = false
    setPending(false)
    if (!page || !page.ok) {
      setFailed(true)
      return
    }
    setResources((prev) => {
      const seen = new Set(prev.map((r) => r.id))
      return [...prev, ...page.resources.filter((r) => !seen.has(r.id))]
    })
    setNextOffset(page.nextOffset)
  }, [nextOffset, query])

  const auto = nextOffset !== null && !failed && resources.length < AUTO_LOAD_LIMIT
  useEffect(() => {
    const el = sentinel.current
    if (!el || !auto || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore()
    }, { rootMargin: '600px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [auto, loadMore])

  const showSupplement = supplementReview !== undefined || (supplementSources.length > 0 && offerSupplement(query.q, query.kind, initial))
  const count = nextOffset === null ? t('countAll', { count: resources.length }) : t('countShown', { count: resources.length })

  return (
    <>
      <ListHeading title={title} filtered={filtered}>
        <span className="label" aria-live="polite">
          {count}
        </span>
      </ListHeading>
      {resources.length === 0 ? (
        <div className="store-rows px-5 py-14 text-center text-fg-2">
          <p className="mb-1.5 text-lg font-bold text-fg">{t('emptyTitle')}</p>
          <p>{t('emptyBody')}</p>
          {filtered && <ClearFiltersLink className="btn mt-6" />}
        </div>
      ) : (
        <>
          <ResourceRows resources={resources} showCategory={query.kind === null} label={title} />
          <div ref={sentinel} className="mt-6 flex flex-col items-center gap-2.5">
            {failed && (
              <p role="alert" className="text-sm text-bad">
                {t('loadFailed')}
              </p>
            )}
            {nextOffset !== null && (
              <button type="button" onClick={() => void loadMore()} aria-busy={pending} disabled={pending} className="btn">
                {pending ? t('loadingMore') : failed ? t('retry') : t('loadMore')}
              </button>
            )}
          </div>
        </>
      )}
      {showSupplement && <StoreSupplement query={query} sources={supplementSources} review={supplementReview} />}
    </>
  )
}
