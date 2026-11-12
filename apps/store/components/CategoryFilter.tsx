'use client'

import { useTranslations } from 'next-intl'
import { useStoreQuery } from '@/lib/use-store-query'

export type CategoryValue = 'all' | 'skill' | 'mcp' | 'provider'

const VALUES: CategoryValue[] = ['all', 'skill', 'mcp', 'provider']

// No per-tab counts: /api/resources pages through ~68k records without a total.
export function CategoryFilter({ active }: { active: CategoryValue }) {
  const t = useTranslations('store')
  const { setParams } = useStoreQuery()

  // The row scrolls, which clips anything drawn outside a tab, so the focus ring
  // sits inside the tab and the padding keeps it clear of the label.
  return (
    <div role="group" aria-label={t('filters.category')} className="-mb-px flex h-14 gap-1 overflow-x-auto sm:gap-3">
      {VALUES.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={active === value}
          onClick={() => setParams({ category: value === 'all' ? null : value })}
          className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2 text-[15px] text-ink-2 transition-colors hover:text-ink aria-pressed:border-ink aria-pressed:font-medium aria-pressed:text-ink focus-visible:-outline-offset-2"
        >
          {t(`categories.${value}`)}
        </button>
      ))}
    </div>
  )
}
