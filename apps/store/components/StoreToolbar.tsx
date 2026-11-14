import type { ResourceSort } from '@as/types'
import Link from 'next/link'
import { Suspense } from 'react'
import { useTranslations } from 'next-intl'
import { CategoryFilter, type CategoryValue } from './CategoryFilter'
import { FilterSheet } from './FilterSheet'
import { SearchInput } from './SearchInput'
import { SortFilter } from './SortFilter'

interface StoreToolbarProps {
  category: CategoryValue
  sort: ResourceSort
}

export function StoreHero({ category, sort }: StoreToolbarProps) {
  const t = useTranslations('store.list')
  return (
    <header className="pb-7 pt-[clamp(40px,7vw,96px)]">
      <h1 className="text-[clamp(34px,4.8vw,58px)] font-extrabold leading-[1.18] [text-wrap:balance]">
        {t('title')}
        <span className="block text-fg-3">{t('hero')}</span>
      </h1>
      <Suspense>
        <SearchInput variant="page" className="mt-[18px]" />
      </Suspense>
      <div className="mt-[18px] flex flex-wrap items-center justify-between gap-3.5">
        <SortFilter active={sort} className="hidden sm:inline-flex" />
        <CategoryFilter active={category} className="hidden sm:inline-flex" />
        <FilterSheet category={category} sort={sort} className="sm:hidden" />
      </div>
    </header>
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

/** Title of the list below the toolbar: what it shows, and a way back to everything. */
export function ListHeading({ title, filtered, children }: { title: string; filtered: boolean; children?: React.ReactNode }) {
  return (
    <div className="mb-4 mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="min-w-0 break-words text-lg font-bold">{title}</h2>
      <span className="flex items-baseline gap-4">
        {children}
        {filtered && <ClearFiltersLink className="link text-[13.5px] text-fg-2" />}
      </span>
    </div>
  )
}

/** The catalog API could not be read: said plainly, with a retry, and kept apart from "no matches". */
export function StoreError({ retryHref }: { retryHref: string }) {
  const t = useTranslations('store.list')
  return (
    <div role="alert" className="store-rows px-5 py-14 text-center text-fg-2">
      <p className="mb-1.5 text-lg font-bold text-fg">{t('errorTitle')}</p>
      <p>{t('errorBody')}</p>
      <a href={retryHref} className="btn mt-6">
        {t('retry')}
      </a>
    </div>
  )
}
