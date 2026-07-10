'use client'

import { useEffect, useState } from 'react'
import { StoreClient } from '@as/sdk'
import type { UserReview } from '@as/types'
import { getAuthToken } from '@/lib/auth/token'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} 星`}
          className={`text-lg ${n <= value ? 'text-store-amber' : 'text-store-text-3'} ${onChange ? 'cursor-pointer' : 'cursor-default'}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export function ReviewsSection({ slug, rating, reviewCount }: { slug: string; rating: number; reviewCount: number }) {
  const client = new StoreClient(API_URL)
  const [reviews, setReviews] = useState<UserReview[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [myRating, setMyRating] = useState(0)
  const [myBody, setMyBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [agg, setAgg] = useState({ rating, reviewCount })

  async function load() {
    const r = await client.getReviews(slug)
    if (r.data) setReviews(r.data)
  }

  useEffect(() => {
    void load()
    void getAuthToken().then(setToken)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  async function submit() {
    if (!token || myRating < 1) return
    setBusy(true)
    const res = await client.submitReview(slug, token, myRating, myBody.trim() || undefined)
    setBusy(false)
    if (res.data) {
      setAgg(res.data)
      setMyBody('')
      await load()
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-store-border bg-store-panel p-4">
      <div className="mb-3 flex items-center gap-3">
        <p className="text-sm font-medium text-store-text">用户评价</p>
        {agg.reviewCount > 0 ? (
          <span className="text-xs text-store-text-2">
            ★ {agg.rating.toFixed(1)} · {agg.reviewCount} 条
          </span>
        ) : (
          <span className="text-xs text-store-text-3">暂无评价</span>
        )}
      </div>

      {token ? (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-store-border-strong p-3">
          <Stars value={myRating} onChange={setMyRating} />
          <textarea
            value={myBody}
            onChange={(e) => setMyBody(e.target.value)}
            placeholder="说说你的使用体验（可选）"
            rows={2}
            className="w-full resize-none rounded-lg border border-store-border bg-store-panel-2 px-3 py-2 text-sm text-store-text outline-none focus:border-store-accent"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || myRating < 1}
            className="self-start rounded-lg bg-store-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? '提交中…' : '发表评价'}
          </button>
        </div>
      ) : (
        <p className="mb-4 text-xs text-store-text-3">登录后可发表评价。</p>
      )}

      <div className="flex flex-col gap-3">
        {reviews.map((r, i) => (
          <div key={i} className="rounded-lg border border-store-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-store-text">{r.authorName ?? '匿名'}</span>
              <span className="text-xs text-store-amber">{'★'.repeat(r.rating)}</span>
              <span className="ml-auto text-[11px] text-store-text-3">{new Date(r.updatedAt).toLocaleDateString()}</span>
            </div>
            {r.body && <p className="mt-1.5 text-[13px] text-store-text-2">{r.body}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
