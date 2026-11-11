'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { useStoreQuery } from '@/lib/use-store-query'

export type Sort = 'downloads' | 'created' | 'rating'

const OPTIONS: { value: Sort; key: 'popular' | 'new' | 'rating' }[] = [
  { value: 'downloads', key: 'popular' },
  { value: 'created', key: 'new' },
  { value: 'rating', key: 'rating' },
]

export function SortSelect({ active }: { active: Sort }) {
  const t = useTranslations('store.sort')
  const { setParams } = useStoreQuery()
  const id = useId()

  return (
    <div className="relative flex h-8 items-center border border-line bg-transparent focus-within:border-ink hover:border-ink">
      <label htmlFor={id} className="label pointer-events-none pl-3 pr-2">
        {t('label')}
      </label>
      <select
        id={id}
        value={active}
        onChange={(e) => setParams({ sort: e.target.value === 'downloads' ? null : e.target.value })}
        className="h-full cursor-pointer appearance-none bg-transparent pl-1 pr-8 text-sm text-ink outline-offset-4"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-plate text-ink">
            {t(opt.key)}
          </option>
        ))}
      </select>
      <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden className="pointer-events-none absolute right-3">
        <path d="m1 1 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </div>
  )
}
