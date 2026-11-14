import type { ResourceSummary } from '@as/types'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { formatCount, resourceHref } from '@/lib/resource'

/** The most installed packages, shown above the unfiltered list. */
export function HotList({ resources }: { resources: ResourceSummary[] }) {
  const t = useTranslations('store')
  const ranked = resources.filter((r) => r.installs != null)
  if (ranked.length === 0) return null
  return (
    <section aria-labelledby="hot-title" className="mb-11 mt-2">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="hot-title" className="text-lg font-bold">
          {t('hot.title')}
        </h2>
        <span className="label">{t('hot.note')}</span>
      </div>
      <ol className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {ranked.map((r, i) => (
          <li key={r.id} data-kind={r.kind}>
            <Link href={resourceHref(r)} scroll={false} className="card hot-card h-full">
              <span className="label">
                {i + 1} · {t(`category.${r.kind}`)}
              </span>
              <span className="min-w-0">
                <b className="block truncate font-bold">{r.name}</b>
                <span className="block truncate text-[13px] text-fg-3">{r.author?.name ?? t('list.unknownAuthor')}</span>
              </span>
              <span className="mt-auto text-[22px] font-semibold leading-none tabular-nums">
                {formatCount(r.installs!)}
                <small className="ml-1.5 text-xs font-medium text-fg-3">{t('hot.unit')}</small>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function CatalogSources() {
  const t = useTranslations('store.sources')
  const items = [
    { kind: 'skill', count: t('skillCount'), from: t('skillFrom') },
    { kind: 'mcp', count: t('mcpCount'), from: t('mcpFrom') },
    { kind: 'provider', count: t('providerCount'), from: t('providerFrom') },
  ] as const
  const tc = useTranslations('store.category')
  return (
    <section className="mt-14">
      <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
        {items.map((item) => (
          <div key={item.kind} data-kind={item.kind} className="bg-bg p-[22px]">
            <span className="kind">{tc(item.kind)}</span>
            <b className="mb-1 mt-2.5 block">{item.count}</b>
            <p className="text-sm text-fg-2">{item.from}</p>
          </div>
        ))}
      </div>
      <p className="label mt-3">{t('note')}</p>
    </section>
  )
}
