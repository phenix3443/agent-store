'use client'

import { useState } from 'react'
import Link from 'next/link'
import * as Tabs from '@radix-ui/react-tabs'
import { ArrowUpRight, Route, Server, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ResourceKind, ResourceSummary } from '@as/types'
import { installCommand, resourceHref } from '@/lib/resource'

export const SHELF_KINDS: ResourceKind[] = ['skill', 'mcp', 'provider']

const ICONS = { skill: Sparkles, mcp: Server, provider: Route } as const

/** Lines drawn on the lower half of a card, taken from the record itself. */
export function cardArt(r: ResourceSummary): { big: string; lines: string[] } {
  const command = installCommand(r)
  if (r.kind === 'skill') {
    return { big: 'SKILL.md', lines: [r.origin.upstreamId, ...(command ? [command] : [])] }
  }
  if (r.kind === 'mcp') {
    return {
      big: r.transports[0] ?? 'mcp',
      lines: [r.origin.upstreamId, ...r.transports.slice(1), ...(r.version ? [`v${r.version.replace(/^v/, '')}`] : [])],
    }
  }
  return { big: r.origin.upstreamId, lines: [...(command ? [command] : []), ...r.tags.slice(0, 3)] }
}

export function CatalogShelf({ samples }: { samples: Record<ResourceKind, ResourceSummary[]> }) {
  const t = useTranslations('site.home.catalog')
  const [kind, setKind] = useState<ResourceKind>('skill')
  const kindName = t(`kinds.${kind}`)

  return (
    <Tabs.Root value={kind} onValueChange={(v) => setKind(v as ResourceKind)}>
      <div className="wrap mb-9 flex flex-wrap items-end justify-between gap-6">
        <h2 id="home-catalog" className="h2">
          {t('title')}
          <span className="dim">{t('dim')}</span>
        </h2>
        <Tabs.List aria-label={t('tabsLabel')} className="seg">
          {SHELF_KINDS.map((k) => (
            <Tabs.Trigger key={k} value={k} data-kind={k}>
              {t(`kinds.${k}`)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </div>
      {SHELF_KINDS.map((k) => (
        <Tabs.Content key={k} value={k} tabIndex={-1} className="outline-none">
          {samples[k].length > 0 ? (
            <ul aria-label={t('shelfLabel', { kind: t(`kinds.${k}`) })} className="shelf">
              {samples[k].map((r) => (
                <li key={r.id} className="contents">
                  <ShelfCard resource={r} unknownAuthor={t('unknownAuthor')} />
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="wrap pb-12 text-fg-2">
              {t('empty')}
            </p>
          )}
        </Tabs.Content>
      ))}
      <div className="wrap flex flex-wrap items-center justify-between gap-4">
        <p className="cap">{t('note')}</p>
        <Link href={`/store?category=${kind}`} className="link inline-flex items-center gap-1.5 text-[15px] font-semibold text-fg">
          {t('all', { kind: kindName })}
          <ArrowUpRight size={15} aria-hidden />
        </Link>
      </div>
    </Tabs.Root>
  )
}

function ShelfCard({ resource: r, unknownAuthor }: { resource: ResourceSummary; unknownAuthor: string }) {
  const Icon = ICONS[r.kind]
  const art = cardArt(r)
  return (
    <Link href={resourceHref(r)} data-kind={r.kind} className="tall">
      <div className="relative px-5 pt-5">
        <div className="mb-4 flex items-start justify-between">
          <span aria-hidden className="tile">
            <Icon size={20} />
          </span>
          <span aria-hidden className="tall-arrow">
            <ArrowUpRight size={16} />
          </span>
        </div>
        <h3 className="truncate text-lg font-bold leading-snug">{r.name}</h3>
        <p className="mt-0.5 truncate text-[12.5px] text-fg-3">{r.author?.name ?? unknownAuthor}</p>
        {r.description && <p className="line-clamp-2 mt-2.5 text-sm leading-relaxed text-fg-2">{r.description}</p>}
      </div>
      <div aria-hidden className="tall-art">
        <div>
          <span className="big">{art.big}</span>
          {art.lines.slice(0, 5).map((line, i) => (
            <span key={`${i}-${line}`} className={i ? 'pl-[22px]' : ''}>
              {line}
            </span>
          ))}
        </div>
      </div>
    </Link>
  )
}
