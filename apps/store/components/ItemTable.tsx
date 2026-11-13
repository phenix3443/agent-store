'use client'

import type { ResourceSummary } from '@as/types'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { formatCount, installCommand, leadSentence, resourceHref } from '@/lib/resource'
import { InstallButton } from './InstallButton'
import { VerifiedMark } from './VerifiedLabel'

function samePath(a: string, b: string): boolean {
  try {
    return decodeURI(a) === decodeURI(b)
  } catch {
    return a === b
  }
}

const COLS = 'md:grid-cols-[64px_minmax(0,1fr)_168px_72px_92px]'

function Installs({ value, className }: { value: number | null; className: string }) {
  const t = useTranslations('store.list')
  if (value == null) {
    return (
      <span className={`${className} text-ink-2`}>
        <span aria-hidden>—</span>
        <span className="sr-only">{t('noInstalls')}</span>
      </span>
    )
  }
  return <span className={className}>{formatCount(value)}</span>
}

/** GitHub stars of the repo behind the row; nothing when the catalog has none. */
function Stars({ value, className }: { value: number | null; className: string }) {
  const t = useTranslations('store.list')
  if (value == null) return null
  return (
    <span className={className}>
      <span aria-hidden>★ {formatCount(value)}</span>
      <span className="sr-only">{t('stars', { count: formatCount(value) })}</span>
    </span>
  )
}

function ItemRow({ resource }: { resource: ResourceSummary }) {
  const t = useTranslations('store')
  const pathname = usePathname()
  const href = resourceHref(resource)
  const current = samePath(pathname, href)

  return (
    <div
      role="row"
      data-current={current ? '' : undefined}
      className={`group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line px-3 py-3.5 transition-colors hover:bg-sel data-[current]:border-ink data-[current]:bg-sel data-[current]:shadow-[0_-1px_0_var(--ink)] md:h-20 md:py-0 ${COLS}`}
    >
      <span role="cell" className="label col-span-2 md:col-span-1 group-data-[current]:text-ink">
        {t(`category.${resource.kind}`)}
      </span>

      <div role="cell" className="min-w-0">
        {/* The link's ::after covers the row, so the whole row opens the package
            while the install button stays a separate control above it. */}
        <Link
          href={href}
          scroll={false}
          data-item-link={resource.id}
          aria-current={current ? 'true' : undefined}
          className="block truncate font-mono text-sm font-medium leading-5 after:absolute after:inset-0 after:content-['']"
        >
          {resource.name}
        </Link>
        {resource.description && (
          <p className="mt-0.5 truncate text-[13px] leading-5 text-ink-2">{leadSentence(resource.description)}</p>
        )}
      </div>

      <div role="cell" className="col-span-2 flex min-w-0 items-baseline gap-2 md:col-span-1 md:block">
        <span className="flex min-w-0 items-center gap-1.5 text-sm leading-5">
          <span className="truncate">{resource.author?.name ?? t('list.unknownAuthor')}</span>
          {resource.verified && <VerifiedMark />}
        </span>
        <span className="ml-auto flex shrink-0 items-baseline gap-3 md:hidden">
          <Stars value={resource.stars} className="font-mono text-[13px] text-ink-2" />
          <Installs value={resource.installs} className="font-mono text-sm" />
        </span>
      </div>

      <span role="cell" className="hidden text-right md:block">
        <Installs value={resource.installs} className="block font-mono text-sm leading-5" />
        <Stars value={resource.stars} className="mt-0.5 block font-mono text-[13px] leading-5 text-ink-2" />
      </span>

      <div role="cell" className="relative z-[1] col-start-2 row-start-2 self-start justify-self-end md:col-start-auto md:row-start-auto md:self-center">
        <InstallButton resource={resource} command={installCommand(resource)} />
      </div>
    </div>
  )
}

export function ItemTable({ resources }: { resources: ResourceSummary[] }) {
  const t = useTranslations('store.list')

  return (
    <div role="table" aria-label={t('title')} className="store-results">
      <div role="rowgroup">
        <div role="row" className={`label hidden h-9 items-center gap-x-4 border-b border-line px-3 md:grid ${COLS}`}>
          <span role="columnheader" className="truncate">{t('colCategory')}</span>
          <span role="columnheader" className="truncate">{t('colPackage')}</span>
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
        {resources.map((resource) => (
          <ItemRow key={resource.id} resource={resource} />
        ))}
      </div>
    </div>
  )
}

export function ItemTableSkeleton({ rows = 8 }: { rows?: number }) {
  const t = useTranslations('store.list')
  return (
    <div className="store-results" aria-busy="true" aria-label={t('loading')} role="status">
      <div className="hidden h-9 border-b border-line md:block" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-line px-3 py-3.5 md:h-20 md:py-0 ${COLS}`}>
          <span className="hidden h-3 w-10 bg-fill md:block" />
          <span className="block space-y-2">
            <span className="block h-3.5 w-40 max-w-full bg-fill" />
            <span className="block h-3 w-72 max-w-full bg-fill" />
          </span>
          <span className="hidden h-3 w-24 bg-fill md:block" />
          <span className="hidden h-3 w-10 justify-self-end bg-fill md:block" />
          <span className="block h-8 w-[68px] justify-self-end bg-fill" />
        </div>
      ))}
    </div>
  )
}
