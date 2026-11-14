'use client'

import type { ResourceSort } from '@as/types'
import { useTranslations } from 'next-intl'
import { SORTS } from '@/lib/resource'
import { useStoreQuery } from '@/lib/use-store-query'

export function SortFilter({ active, className = '' }: { active: ResourceSort; className?: string }) {
  const t = useTranslations('store.sort')
  const { setParams } = useStoreQuery()

  return (
    <div role="group" aria-label={t('label')} className={`seg ${className}`}>
      {SORTS.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={active === value}
          onClick={() => setParams({ sort: value === 'default' ? null : value })}
        >
          {t(value)}
        </button>
      ))}
    </div>
  )
}
