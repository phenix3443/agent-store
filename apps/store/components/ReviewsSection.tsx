'use client'

import { useEffect, useId, useState } from 'react'
import { Star } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { StoreClient } from '@as/sdk'
import type { UserReview } from '@as/types'
import { getAuthToken } from '@/lib/auth/token'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={14} className={n <= value ? 'fill-current' : 'text-line-strong'} />
      ))}
    </span>
  )
}

export function ReviewsSection({ slug, rating, reviewCount }: { slug: string; rating: number; reviewCount: number }) {
  const t = useTranslations('store.reviews')
  const locale = useLocale()
  const bodyId = useId()
  const [reviews, setReviews] = useState<UserReview[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [myRating, setMyRating] = useState(0)
  const [myBody, setMyBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [agg, setAgg] = useState({ rating, reviewCount })

  useEffect(() => {
    let active = true
    const client = new StoreClient(API_URL)
    void client.getReviews(slug).then((r) => {
      if (active && r.data) setReviews(r.data)
    })
    void getAuthToken().then((next) => {
      if (active) setToken(next)
    })
    return () => {
      active = false
    }
  }, [slug])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || myRating < 1) return
    setBusy(true)
    const client = new StoreClient(API_URL)
    const res = await client.submitReview(slug, token, myRating, myBody.trim() || undefined)
    setBusy(false)
    if (res.data) {
      setAgg(res.data)
      setMyBody('')
      const next = await client.getReviews(slug)
      if (next.data) setReviews(next.data)
    }
  }

  const dateFormat = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })

  return (
    <section className="mt-9">
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="label">{t('title')}</h2>
        <span className="text-[13px] text-ink-2">
          {agg.reviewCount > 0 ? t('summary', { rating: agg.rating.toFixed(1), count: agg.reviewCount }) : t('none')}
        </span>
      </div>

      {token ? (
        <form onSubmit={submit} className="flex flex-col gap-3 border-t border-line py-4">
          <fieldset>
            <legend className="mb-1.5 text-[13px] text-ink-2">{t('yourRating')}</legend>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={t('stars', { n })}
                  aria-pressed={myRating === n}
                  onClick={() => setMyRating(n)}
                  className="grid h-8 w-8 place-items-center hover:bg-sel"
                >
                  <Star size={18} aria-hidden className={n <= myRating ? 'fill-current' : 'text-line-strong'} />
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor={bodyId} className="mb-1.5 block text-[13px] text-ink-2">
              {t('bodyLabel')}
            </label>
            <textarea
              id={bodyId}
              value={myBody}
              onChange={(e) => setMyBody(e.target.value)}
              rows={3}
              className="w-full resize-y border border-line bg-paper px-3 py-2 text-sm focus:border-ink"
            />
          </div>
          <button type="submit" disabled={busy || myRating < 1} className="btn self-start">
            {busy ? t('submitting') : t('submit')}
          </button>
        </form>
      ) : (
        <p className="border-t border-line py-3 text-sm text-ink-2">{t('loginHint')}</p>
      )}

      <ul>
        {reviews.map((r, i) => (
          <li key={i} className="border-t border-line py-3 last:border-b">
            <div className="flex items-center gap-2.5 text-sm">
              <span className="font-medium">{r.authorName ?? t('anonymous')}</span>
              <Stars value={r.rating} />
              <span className="sr-only">{t('stars', { n: r.rating })}</span>
              <time dateTime={r.updatedAt} className="ml-auto font-mono text-[13px] text-ink-2">
                {dateFormat.format(new Date(r.updatedAt))}
              </time>
            </div>
            {r.body && <p className="mt-1.5 max-w-[62ch] text-sm leading-[22px]">{r.body}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
