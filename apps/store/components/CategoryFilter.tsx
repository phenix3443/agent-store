'use client'

import { useTranslations } from 'next-intl'
import { useStoreQuery } from '@/lib/use-store-query'

export type CategoryValue = 'all' | 'skill' | 'mcp' | 'provider'
export type CategoryCounts = Record<CategoryValue, number>

const VALUES: CategoryValue[] = ['all', 'skill', 'mcp', 'provider']

export function CategoryFilter({ active, counts }: { active: CategoryValue; counts: CategoryCounts }) {
  const t = useTranslations('store')
  const { setParams } = useStoreQuery()

  return (
    <div role="group" aria-label={t('filters.category')} className="-mb-px flex h-14 gap-5 overflow-x-auto sm:gap-7">
      {VALUES.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={active === value}
          onClick={() => setParams({ category: value === 'all' ? null : value })}
          className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent text-[15px] text-ink-2 transition-colors hover:text-ink aria-pressed:border-ink aria-pressed:font-medium aria-pressed:text-ink focus-visible:-outline-offset-2"
        >
          {t(`categories.${value}`)}
          <span className="font-mono text-xs font-normal text-ink-2">{counts[value]}</span>
        </button>
      ))}
    </div>
  )
}
