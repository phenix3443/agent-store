'use client'

import type { ResourceSummary } from '@as/types'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { formatCount, installCommand, leadSentence, resourceHref } from '@/lib/resource'
import { InstallButton } from './InstallButton'
import { KindTile } from './KindTile'
import { InstalledBadge } from './LocalInstalled'
import { VerifiedMark } from './VerifiedLabel'

function samePath(a: string, b: string): boolean {
  try {
    return decodeURI(a) === decodeURI(b)
  } catch {
    return a === b
  }
}

export function Count({ value }: { value: number | null }) {
  const t = useTranslations('store.list')
  if (value == null) {
    return (
      <>
        <span aria-hidden>—</span>
        <span className="sr-only">{t('noInstalls')}</span>
      </>
    )
  }
  return <>{formatCount(value)}</>
}

function Row({ resource, showCategory, via }: { resource: ResourceSummary; showCategory: boolean; via?: string }) {
  const t = useTranslations('store')
  const pathname = usePathname()
  const href = resourceHref(resource)
  const current = samePath(pathname, href)

  return (
    <li data-kind={resource.kind} data-current={current ? '' : undefined} className="store-row">
      <KindTile kind={resource.kind} />
      <div className="min-w-0">
        {/* The link's ::after covers the row, so the whole row opens the package
            while the install button stays a separate control above it. */}
        <Link
          href={href}
          scroll={false}
          data-item-link={resource.id}
          aria-current={current ? 'true' : undefined}
          className="block truncate text-[15.5px] font-bold leading-6 after:absolute after:inset-0 after:content-['']"
        >
          {resource.name}
        </Link>
        <p className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-[12.5px] leading-5 text-fg-3">
          {showCategory && <span className="kind">{t(`category.${resource.kind}`)}</span>}
          <span className="truncate">{resource.author?.name ?? t('list.unknownAuthor')}</span>
          {resource.verified && <VerifiedMark />}
          {via && <span className="shrink-0 text-fg-2">{via}</span>}
          <InstalledBadge id={resource.id} />
          <span className="store-row-meta-stat ml-auto shrink-0 font-mono">
            <Count value={resource.installs} /> {t('list.installsUnit')}
          </span>
        </p>
      </div>
      {resource.description ? <p className="store-row-desc">{leadSentence(resource.description)}</p> : <span className="store-row-desc" />}
      <span className="store-row-stat">
        <Count value={resource.installs} />
        <small>{t('list.installsUnit')}</small>
      </span>
      <span className="store-row-stat store-row-stat-2">
        {resource.stars == null ? (
          <span aria-hidden>—</span>
        ) : (
          <>
            <span aria-hidden>{formatCount(resource.stars)}</span>
            <span className="sr-only">{t('list.stars', { count: formatCount(resource.stars) })}</span>
          </>
        )}
        <small aria-hidden>{t('list.starsUnit')}</small>
      </span>
      <div className="store-row-act">
        <InstallButton resource={resource} command={installCommand(resource)} />
      </div>
    </li>
  )
}

/**
 * `showCategory` is off on a single-kind filter, where every row would repeat the same category.
 * `via`: resource id → where it was found, for search supplement rows.
 */
export function ResourceRows({
  resources,
  showCategory,
  label,
  via,
}: {
  resources: ResourceSummary[]
  showCategory: boolean
  label: string
  via?: Record<string, string>
}) {
  return (
    <ul aria-label={label} className="store-rows store-results">
      {resources.map((resource) => (
        <Row key={resource.id} resource={resource} showCategory={showCategory} via={via?.[resource.id]} />
      ))}
    </ul>
  )
}

export function ResourceRowsSkeleton({ rows = 6 }: { rows?: number }) {
  const t = useTranslations('store.list')
  return (
    <div role="status" aria-busy="true" aria-label={t('loading')} className="store-rows store-results">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className="store-row">
          <span className="sk h-[38px] w-[38px] rounded-control" />
          <span className="block">
            <span className="sk h-[15px] w-[55%]" />
            <span className="sk mt-2 h-[11px] w-[35%]" />
          </span>
          <span className="store-row-desc">
            <span className="sk h-3 w-[90%]" />
          </span>
          <span className="store-row-stat">
            <span className="sk ml-auto h-3.5 w-12" />
          </span>
          <span className="store-row-stat store-row-stat-2">
            <span className="sk ml-auto h-3.5 w-12" />
          </span>
          <span className="store-row-act">
            <span className="sk h-9 w-[68px] rounded-control" />
          </span>
        </div>
      ))}
    </div>
  )
}
