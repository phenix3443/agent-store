'use client'

import type { SearchSupplementResponse } from '@as/types'
import { ExternalLink, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { lookupSupplement } from '@/app/store/actions'
import type { StoreQuery } from '@/lib/resource'
import { SITE_NAMES } from '@/lib/supplement'
import { ResourceRows } from './ResourceRows'

/** The states this block draws; `offer` is before the visitor agreed to send the query. */
export type SupplementView = 'offer' | 'searching' | 'found' | 'none' | 'unavailable'

const MAX_POLLS = 6

interface StoreSupplementProps {
  query: StoreQuery
  /** Opens a state without asking the API, for screenshots and review (`?supplement=`). */
  review?: SupplementView
}

/**
 * Looks a search the catalog answers poorly up on other skill directories, only once
 * the visitor agreed to send the query there (#152).
 */
export function StoreSupplement({ query, review }: StoreSupplementProps) {
  const t = useTranslations('store.supplement')
  const [view, setView] = useState<SupplementView | 'hidden'>(review ?? 'offer')
  const [result, setResult] = useState<SearchSupplementResponse | null>(null)
  const polls = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(timer.current)
    }
  }, [])

  const ask = useCallback(async () => {
    setView('searching')
    const res = await lookupSupplement(query).catch(() => null)
    if (!alive.current) return
    if (!res) return setView('unavailable')
    setResult(res)
    switch (res.status) {
      case 'disabled':
      case 'not_needed':
        return setView('hidden')
      case 'searching':
        if (++polls.current > MAX_POLLS) return setView('unavailable')
        timer.current = setTimeout(() => void ask(), (res.retryAfterSeconds ?? 2) * 1000)
        return
      default:
        return setView(res.status)
    }
  }, [query])

  if (view === 'hidden') return null

  const q = query.q
  return (
    <div aria-live="polite" className="mt-6" data-supplement={view}>
      {view === 'offer' && (
        <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="break-words font-bold">{t('offerTitle', { q })}</p>
            <p className="mt-1 max-w-[62ch] text-sm text-fg-2">{t('offerBody')}</p>
          </div>
          <button type="button" className="btn shrink-0" onClick={() => void ask()}>
            {t('offerAction')}
          </button>
        </div>
      )}
      {view === 'searching' && (
        <p className="card flex items-center gap-3 text-fg-2">
          <Loader2 size={18} aria-hidden className="shrink-0 animate-spin text-mcp motion-reduce:animate-none" />
          {t('searching')}
        </p>
      )}
      {view === 'none' && (
        <p className="card break-words text-fg-2">
          {t('none', { q })}
        </p>
      )}
      {view === 'unavailable' && (
        <div className="card flex flex-wrap items-center justify-between gap-3 text-fg-2">
          <p>{t('unavailable')}</p>
          {!review && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                polls.current = 0
                void ask()
              }}
            >
              {t('retry')}
            </button>
          )}
        </div>
      )}
      {view === 'found' && result && <Found result={result} />}
    </div>
  )
}

function Found({ result }: { result: SearchSupplementResponse }) {
  const t = useTranslations('store.supplement')
  return (
    <div>
      <h2 className="mb-4 text-lg font-bold">{t('foundTitle')}</h2>
      {result.resources.length > 0 && <ResourceRows resources={result.resources} showCategory={false} label={t('foundTitle')} />}
      {result.listings.length > 0 && (
        <>
          <p className="mb-3 mt-5 text-sm text-fg-3">{t('listingsNote')}</p>
          <ul className="store-rows">
            {result.listings.map((l) => (
              <li key={l.key} data-kind="skill" className="store-row">
                <span aria-hidden className="tile">
                  <ExternalLink size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15.5px] font-bold leading-6">{l.name}</p>
                  {l.author && <p className="truncate text-[12.5px] leading-5 text-fg-3">{l.author}</p>}
                </div>
                {l.description ? <p className="store-row-desc">{l.description}</p> : <span className="store-row-desc" />}
                <div className="store-row-act">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="btn">
                    {t('viewOn', { site: SITE_NAMES[l.site] ?? l.site })}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {result.partial && <p className="mt-3 text-[13px] text-fg-3">{t('partial')}</p>}
    </div>
  )
}
