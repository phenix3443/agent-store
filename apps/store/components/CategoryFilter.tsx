'use client'

import { useTranslations } from 'next-intl'
import { useStoreQuery } from '@/lib/use-store-query'

export type CategoryValue = 'all' | 'skill' | 'mcp' | 'provider'

export const CATEGORY_VALUES: CategoryValue[] = ['all', 'skill', 'mcp', 'provider']

// No per-kind counts: /api/resources pages through ~70k records without a total.
export function CategoryFilter({ active, className = '' }: { active: CategoryValue; className?: string }) {
  const t = useTranslations('store')
  const { setParams } = useStoreQuery()

  return (
    <div role="group" aria-label={t('filters.category')} className={`seg ${className}`}>
      {CATEGORY_VALUES.map((value) => (
        <button
          key={value}
          type="button"
          data-kind={value === 'all' ? undefined : value}
          aria-pressed={active === value}
          onClick={() => setParams({ category: value === 'all' ? null : value })}
        >
          {t(`categories.${value}`)}
        </button>
      ))}
    </div>
  )
}
