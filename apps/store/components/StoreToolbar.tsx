import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CategoryFilter, type CategoryValue } from './CategoryFilter'
import { SortSelect } from './SortSelect'
import type { ResourceSort } from '@as/types'

interface StoreToolbarProps {
  category: CategoryValue
  sort: ResourceSort
  filtered: boolean
}

export function StoreHeading() {
  const t = useTranslations('store.list')
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2 pb-5 pt-8 lg:pb-6 lg:pt-10">
      <h1 className="text-[40px] leading-none tracking-[-0.035em] sm:text-[56px] lg:text-[72px]">{t('title')}</h1>
    </div>
  )
}

export function ClearFiltersLink({ className = 'btn' }: { className?: string }) {
  const t = useTranslations('store.filters')
  return (
    <Link href="/store" scroll={false} className={className}>
      {t('clear')}
    </Link>
  )
}

export function StoreToolbar({ category, sort, filtered }: StoreToolbarProps) {
  return (
    <div className="flex flex-col border-b border-ink lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <CategoryFilter active={category} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line py-2.5 lg:border-t-0 lg:py-0">
        <SortSelect active={sort} />
        {filtered && (
          <ClearFiltersLink className="inline-flex h-9 items-center text-sm underline decoration-line-strong transition-colors hover:decoration-ink" />
        )}
      </div>
    </div>
  )
}

/** The catalog API could not be read: said plainly, with a retry, and kept apart from "no matches". */
export function StoreError({ retryHref }: { retryHref: string }) {
  const t = useTranslations('store.list')
  return (
    <div role="alert" className="store-results border-b border-line px-3 py-14">
      <p className="text-lg font-medium">{t('errorTitle')}</p>
      <p className="mt-1.5 max-w-[60ch] text-sm text-ink-2">{t('errorBody')}</p>
      <div className="mt-5">
        <a href={retryHref} className="btn">
          {t('retry')}
        </a>
      </div>
    </div>
  )
}
