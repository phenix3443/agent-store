import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CategoryFilter, type CategoryCounts, type CategoryValue } from './CategoryFilter'
import { SortSelect, type Sort } from './SortSelect'
import { VerifiedToggle } from './VerifiedToggle'

interface StoreToolbarProps {
  category: CategoryValue
  counts: CategoryCounts
  sort: Sort
  verifiedOnly: boolean
  total: number
  filtered: boolean
}

export function StoreHeading() {
  const t = useTranslations('store.list')
  return <h1 className="sr-only">{t('title')}</h1>
}

export function ClearFiltersLink({ className = 'btn' }: { className?: string }) {
  const t = useTranslations('store.filters')
  return (
    <Link href="/store" scroll={false} className={className}>
      {t('clear')}
    </Link>
  )
}

export function StoreToolbar({ category, counts, sort, verifiedOnly, total, filtered }: StoreToolbarProps) {
  const t = useTranslations('store.filters')
  return (
    <div className="flex flex-col border-b border-ink lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <CategoryFilter active={category} counts={counts} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line py-3 lg:border-t-0 lg:py-0">
        <VerifiedToggle active={verifiedOnly} />
        <SortSelect active={sort} />
        <p className="ml-auto font-mono text-xs text-ink-2 lg:ml-0" aria-live="polite">
          {t('results', { count: total })}
        </p>
        {filtered && (
          <ClearFiltersLink className="text-sm underline decoration-line-strong hover:decoration-ink" />
        )}
      </div>
    </div>
  )
}
