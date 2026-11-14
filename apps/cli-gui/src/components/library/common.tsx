import { useState, type ReactNode } from 'react'
import { ExternalLink, Trash2 } from 'lucide-react'
import type { UpdateResult } from '@as/types'
import { callRpc, errorText } from '../../lib/rpc'
import { formatVersion, storePageUrl } from '../../lib/catalog'
import { openExternal } from '../../lib/openExternal'
import type { InstalledRow } from '../../lib/useInstalled'
import { useAppState } from '../../state/AppState'
import { useTerminalLog } from '../../state/TerminalLog'
import { useT } from '../../i18n'
import { Button } from '../ui/button'
import { toast } from '../ui/toast'
import { Facts, Section } from './parts'
import { Banner } from '../ui/states'
import { cn } from '../ui/cn'

export interface UpdateRow {
  slug: string
  ok: boolean
  /** Updated from → to; absent when it already was the latest. */
  versions?: [string, string]
  error?: string
}

/** `aas update <slug>`, or every slug given in turn for 全部更新; one failing does not stop the rest. */
export function useUpdater() {
  const t = useT()
  const { bumpInstalledVersion } = useAppState()
  const { appendLine } = useTerminalLog()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<UpdateRow[] | null>(null)

  async function update(slugs: string[]) {
    setBusy(true)
    setResults(null)
    setProgress({ done: 0, total: slugs.length })
    const rows: UpdateRow[] = []
    for (const slug of slugs) {
      appendLine(`$ aas update ${slug}`)
      try {
        const out = await callRpc<UpdateResult[]>('update', [slug])
        for (const r of out) appendLine(`✓ ${r.slug} ${formatVersion(r.fromVersion)} → ${formatVersion(r.toVersion)}`, 'green')
        const r = out.find((x) => x.slug === slug)
        rows.push({ slug, ok: true, ...(r ? { versions: [formatVersion(r.fromVersion), formatVersion(r.toVersion)] as [string, string] } : {}) })
      } catch (err) {
        appendLine(`✗ ${errorText(err)}`, 'red')
        rows.push({ slug, ok: false, error: errorText(err) })
        if (slugs.length === 1) toast.error(`${t('lib.updateFailed')} ${slug}`)
      }
      setProgress({ done: rows.length, total: slugs.length })
    }
    setBusy(false)
    setProgress(null)
    bumpInstalledVersion()
    const done = rows.filter((r) => r.ok).length
    if (slugs.length > 1) setResults(rows)
    else if (done) toast(t('lib.updated').replace('{0}', String(done)))
  }

  async function check() {
    setBusy(true)
    try {
      const updates = await callRpc<{ slug: string }[]>('checkUpdates')
      toast(updates.length ? t('palette.updatesFound').replace('{n}', String(updates.length)) : t('palette.upToDate'))
    } catch {
      toast.error(t('palette.checkFailed'))
    } finally {
      setBusy(false)
      bumpInstalledVersion()
    }
  }

  return { busy, progress, results, dismissResults: () => setResults(null), update, check }
}

/** What 全部更新 did, item by item. */
export function UpdateResults({ rows, nameOf, onClose }: { rows: UpdateRow[]; nameOf: (slug: string) => string; onClose: () => void }) {
  const t = useT()
  const failed = rows.filter((r) => !r.ok).length
  const ok = rows.length - failed
  return (
    <div className="mb-3">
      <Banner
        tone={failed ? 'warn' : 'info'}
        title={failed ? t('updAll.summary').replace('{0}', String(ok)).replace('{1}', String(failed)) : t('updAll.allOk').replace('{0}', String(ok))}
        actions={<Button size="sm" onClick={onClose}>{t('ui.close')}</Button>}
      >
        <ul aria-label={t('updAll.resultT')} className="mt-1 flex flex-col gap-1 text-[12px]">
          {rows.map((r) => (
            <li key={r.slug} className="flex flex-wrap items-baseline gap-x-2">
              <span aria-hidden className={r.ok ? 'text-provider' : 'text-bad'}>{r.ok ? '✓' : '✗'}</span>
              <b className="font-semibold text-fg">{nameOf(r.slug)}</b>
              <span className={cn('min-w-0 break-all', r.ok ? 'font-mono text-[11.5px] text-fg-3' : 'text-fg-2')}>
                {r.ok ? (r.versions ? `${r.versions[0]} → ${r.versions[1]}` : t('updAll.same')) : r.error}
              </span>
            </li>
          ))}
        </ul>
      </Banner>
    </div>
  )
}

/** 版本与来源: what is installed, where it came from, and the update when the catalog has a newer one. */
export function VersionSection({ row, onUpdate, updating }: { row: InstalledRow; onUpdate: () => void; updating: boolean }) {
  const t = useT()
  const { setNavView, setCategoryFilter, setSelectedSlug } = useAppState()
  const facts: [string, ReactNode][] = [
    [
      t('f.version'),
      <span key="v" className="font-mono text-xs">
        {formatVersion(row.version)}
        {row.update && <span className="text-warn"> → {formatVersion(row.update.latestVersion)}</span>}
      </span>,
    ],
  ]
  if (row.resourceId) facts.push([t('f.id'), <span key="id" className="break-all font-mono text-[11.5px]">{row.resourceId}</span>])
  facts.push([t('f.updated'), new Date(row.updatedAt).toLocaleDateString()])
  const links: { label: string; url: string }[] = []
  if (row.resourceId) links.push({ label: t('act.storePage'), url: storePageUrl(row.category, row.resourceId) })
  if (row.category === 'skill' && row.contentUrl) links.push({ label: t('lib.source'), url: row.contentUrl })
  if (links.length) {
    facts.push([
      t('f.source'),
      <span key="src" className="flex flex-col items-start gap-1">
        {links.map((l) => (
          <button key={l.url} type="button" onClick={() => void openExternal(l.url)} className="inline-flex items-center gap-1 text-fg-2 underline-offset-2 hover:text-fg hover:underline">
            {l.label} <ExternalLink size={12} />
          </button>
        ))}
      </span>,
    ])
  }

  function viewInCatalog() {
    setCategoryFilter('all')
    setNavView('browse')
    setSelectedSlug(row.resourceId!)
  }

  return (
    <Section
      title={t('sec.version')}
      extra={
        row.resourceId ? (
          <button type="button" onClick={viewInCatalog} className="font-medium text-fg-2 hover:text-fg hover:underline">
            {t('act.inCatalog')}
          </button>
        ) : undefined
      }
    >
      <Facts rows={facts} />
      {row.update && (
        <div className="mt-3">
          <Button variant="kind" disabled={updating} onClick={onUpdate}>
            {t('act.updateTo').replace('{0}', formatVersion(row.update.latestVersion))}
          </Button>
        </div>
      )}
    </Section>
  )
}

export function DangerSection({ label, onClick, extra }: { label: string; onClick: () => void; extra?: ReactNode }) {
  return (
    <section className="mt-5 flex flex-wrap gap-2">
      {extra}
      <Button variant="danger" onClick={onClick}>
        <Trash2 />
        {label}
      </Button>
    </section>
  )
}
