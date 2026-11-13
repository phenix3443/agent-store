'use client'

import type { ResourceSummary } from '@as/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { loadMoreResources } from '@/app/store/actions'
import type { StoreQuery } from '@/lib/resource'
import { ItemTable } from './ItemTable'

// Scrolling loads pages by itself up to this many rows; past it the button
// does, so the footer stays reachable.
const AUTO_LOAD_LIMIT = 200

interface ResourceListProps {
  query: StoreQuery
  initial: ResourceSummary[]
  initialNextOffset: number | null
  emptyAction?: React.ReactNode
}

/**
 * The first page comes from the server render; later pages through a server
 * action, so the browser never talks to the API directly. Remounted (by key)
 * whenever the query changes.
 */
export function ResourceList({ query, initial, initialNextOffset, emptyAction }: ResourceListProps) {
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

  if (resources.length === 0) {
    return (
      <div className="store-results border-b border-line px-3 py-14">
        <p className="text-lg font-medium">{t('emptyTitle')}</p>
        <p className="mt-1.5 max-w-[60ch] text-sm text-ink-2">{t('emptyBody')}</p>
        {emptyAction && <div className="mt-5">{emptyAction}</div>}
      </div>
    )
  }

  return (
    <>
      <ItemTable resources={resources} showCategory={query.kind === null} />
      <div ref={sentinel} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-3 py-6">
        <p className="font-mono text-xs text-ink-2" aria-live="polite">
          {nextOffset === null ? t('countAll', { count: resources.length }) : t('countShown', { count: resources.length })}
        </p>
        {failed && (
          <p role="alert" className="text-sm text-danger">
            {t('loadFailed')}
          </p>
        )}
        {nextOffset !== null && (
          <button type="button" onClick={() => void loadMore()} aria-busy={pending} disabled={pending} className="btn min-h-10 px-5">
            {pending ? t('loadingMore') : failed ? t('retry') : t('loadMore')}
          </button>
        )}
      </div>
    </>
  )
}
