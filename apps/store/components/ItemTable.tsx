'use client'

import type { Item } from '@as/types'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { itemHref } from '@/lib/item-href'
import { formatDownloads } from '@/lib/item-meta'
import { reviewVerdict } from '@/lib/review'
import { InstallButton } from './InstallButton'
import { ReviewStatus } from './ReviewStatus'
import { TierLabel } from './TierLabel'

const COLS = 'md:grid-cols-[64px_minmax(0,1fr)_104px_148px_72px_92px]'

function ItemRow({ item, wrap }: { item: Item; wrap: boolean }) {
  const t = useTranslations('store')
  const pathname = usePathname()
  const href = itemHref(item)
  const current = pathname === href

  return (
    <div
      role="row"
      data-current={current ? '' : undefined}
      className={`group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line px-3 py-3.5 transition-colors hover:bg-sel data-[current]:border-ink data-[current]:bg-sel data-[current]:shadow-[0_-1px_0_var(--ink)] ${wrap ? 'md:min-h-20 md:py-3' : 'md:h-20 md:py-0'} ${COLS}`}
    >
      <span role="cell" className="label col-span-2 md:col-span-1 group-data-[current]:text-ink">
        {t(`category.${item.category}`)}
      </span>

      <div role="cell" className="min-w-0">
        {/* The link's ::after covers the row, so the whole row opens the package
            while the copy button stays a separate control above it. */}
        <Link
          href={href}
          scroll={false}
          data-item-link={item.slug}
          aria-current={current ? 'true' : undefined}
          className="block truncate font-mono text-sm font-medium leading-5 after:absolute after:inset-0 after:content-['']"
        >
          {item.name}
        </Link>
        <p className={`mt-0.5 text-[13px] leading-5 text-ink-2 ${wrap ? '' : 'truncate'}`}>{item.description}</p>
      </div>

      <div role="cell" className="order-last col-span-2 md:order-none md:col-span-1">
        <ReviewStatus verdict={reviewVerdict(item)} />
      </div>

      <div role="cell" className="col-span-2 flex min-w-0 items-baseline gap-2 md:col-span-1 md:block">
        <span className="block truncate text-sm leading-5">{item.publisher.name}</span>
        <TierLabel tier={item.publisher.tier} className="text-[13px] leading-5 text-ink-2 md:mt-0.5" />
        <span className="ml-auto font-mono text-sm md:hidden">{formatDownloads(item.downloads)}</span>
      </div>

      <span role="cell" className="hidden text-right font-mono text-sm md:block">
        {formatDownloads(item.downloads)}
      </span>

      <div role="cell" className="relative z-[1] col-start-2 row-start-2 self-start justify-self-end md:col-start-auto md:row-start-auto md:self-center">
        <InstallButton item={item} />
      </div>
    </div>
  )
}

export function ItemTable({
  items,
  emptyAction,
  wrapDescriptions = false,
}: {
  items: Item[]
  emptyAction?: React.ReactNode
  /** Short descriptions shown whole (the landing page); the store list keeps one truncated line. */
  wrapDescriptions?: boolean
}) {
  const t = useTranslations('store.list')

  if (items.length === 0) {
    return (
      <div className="store-results border-b border-line px-3 py-14">
        <p className="text-lg font-medium">{t('emptyTitle')}</p>
        <p className="mt-1.5 max-w-[60ch] text-sm text-ink-2">{t('emptyBody')}</p>
        {emptyAction && <div className="mt-5">{emptyAction}</div>}
      </div>
    )
  }

  return (
    <div role="table" aria-label={t('title')} className="store-results">
      <div role="rowgroup">
        <div role="row" className={`label hidden h-9 items-center gap-x-4 border-b border-line px-3 md:grid ${COLS}`}>
          <span role="columnheader" className="truncate">{t('colCategory')}</span>
          <span role="columnheader" className="truncate">{t('colPackage')}</span>
          <span role="columnheader" className="truncate">{t('colReview')}</span>
          <span role="columnheader" className="truncate">{t('colPublisher')}</span>
          <span role="columnheader" className="truncate text-right">
            {t('colInstalls')}
          </span>
          <span role="columnheader" className="truncate text-right">
            {t('colInstall')}
          </span>
        </div>
      </div>
      <div role="rowgroup">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} wrap={wrapDescriptions} />
        ))}
      </div>
    </div>
  )
}
