'use client'

import type { ResourceSort } from '@as/types'
import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { SORTS } from '@/lib/resource'
import { useStoreQuery } from '@/lib/use-store-query'

export function SortSelect({ active }: { active: ResourceSort }) {
  const t = useTranslations('store.sort')
  const { setParams } = useStoreQuery()
  const id = useId()

  // One frame for label and value. The select draws no outline of its own: the
  // keyboard ring goes around the whole frame, so it never cuts through the label.
  return (
    <div className="relative inline-flex h-9 items-center border border-line transition-colors hover:border-line-strong focus-within:border-ink has-[select:focus-visible]:outline has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-ink">
      <label htmlFor={id} className="label cursor-pointer pl-3 pr-2">
        {t('label')}
      </label>
      <select
        id={id}
        value={active}
        onChange={(e) => setParams({ sort: e.target.value === 'default' ? null : e.target.value })}
        className="h-full cursor-pointer appearance-none bg-transparent pr-8 text-sm text-ink focus-visible:outline-none"
      >
        {SORTS.map((value) => (
          <option key={value} value={value} className="bg-plate text-ink">
            {t(value)}
          </option>
        ))}
      </select>
      <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden className="pointer-events-none absolute right-3">
        <path d="m1 1 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </div>
  )
}
