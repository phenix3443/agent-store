import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { BatchOperation, BatchOutcome, ToolTarget } from '@as/types'
import { callRpc, errorText, RpcError } from '../../lib/rpc'
import { describeError } from '../../lib/errors'
import { AGENTS, TARGET_LABEL } from '../../lib/agents'
import type { InstalledRow } from '../../lib/useInstalled'
import { useAppState } from '../../state/AppState'
import { useTerminalLog } from '../../state/TerminalLog'
import { useT } from '../../i18n'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/menu'
import { Spinner } from '../ui/states'
import { cn } from '../ui/cn'
import { Steps } from './parts'

export type BulkAction = 'enable' | 'disable' | 'uninstall'
type Targets = ToolTarget[]

interface ResultLine {
  ok: boolean
  text: string
}
interface ResultRow {
  slug: string
  name: string
  lines: ResultLine[]
}

type Phase =
  | { kind: 'confirm'; rows: InstalledRow[] }
  | { kind: 'running'; action: BulkAction; count: number }
  | { kind: 'results'; action: BulkAction; rows: ResultRow[] }

/** The steps for `batch`: only what would change; an agent the entry doesn't support is left out. */
export function bulkOperations(action: BulkAction, rows: InstalledRow[], targets: Targets): BatchOperation[] {
  if (action === 'uninstall') return rows.map((r) => ({ action, slug: r.slug }))
  const ops: BatchOperation[] = []
  for (const r of rows) {
    for (const target of targets) {
      const on = !!r.enabledFor[target]
      if (action === 'enable' && !on && r.compatibleWith.includes(target)) ops.push({ action, slug: r.slug, target })
      if (action === 'disable' && on) ops.push({ action, slug: r.slug, target })
    }
  }
  return ops
}

function command(op: BatchOperation): string {
  return op.action === 'uninstall' ? `$ aas uninstall ${op.slug}` : `$ aas ${op.action} ${op.slug} --for ${op.target}`
}

/** Selection on a library page and the enable / disable / uninstall steps run on it in one `batch` call. */
export function useBulk(visible: InstalledRow[], onOpen: (slug: string) => void) {
  const t = useT()
  const { bumpInstalledVersion } = useAppState()
  const { appendLine } = useTerminalLog()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [phase, setPhase] = useState<Phase | null>(null)

  const chosen = visible.filter((r) => selected.has(r.slug))
  const allOn = visible.length > 0 && chosen.length === visible.length

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  function toggleAll() {
    setSelected(allOn ? new Set() : new Set(visible.map((r) => r.slug)))
  }

  async function run(action: BulkAction, rows: InstalledRow[], targets: Targets) {
    const ops = bulkOperations(action, rows, targets)
    setPhase({ kind: 'running', action, count: rows.length })
    let outcomes: BatchOutcome[] = []
    if (ops.length) {
      for (const op of ops) appendLine(command(op))
      try {
        outcomes = await callRpc<BatchOutcome[]>('batch', [ops])
      } catch (err) {
        appendLine(`✗ ${errorText(err)}`, 'red')
        outcomes = ops.map((op): BatchOutcome => ({ ...op, ok: false, error: { message: errorText(err) } }))
      }
    }
    const result: ResultRow[] = rows.map((r) => {
      const mine = outcomes.filter((o) => o.slug === r.slug)
      if (!mine.length) return { slug: r.slug, name: r.name, lines: [{ ok: true, text: t('bulk.noop') }] }
      return {
        slug: r.slug,
        name: r.name,
        lines: mine.map((o) => {
          if (o.ok) {
            const text = o.action === 'uninstall' ? t('bulk.uninstalled') : t(o.action === 'enable' ? 'bulk.enabled' : 'bulk.disabled').replace('{0}', TARGET_LABEL[o.target])
            appendLine(`✓ ${text} ${o.slug}`, 'green')
            return { ok: true, text }
          }
          appendLine(`✗ ${o.error.message}`, 'red')
          const friendly = describeError(new RpcError(o.error.message, o.error.code, o.error), t, o.action === 'uninstall' ? 'uninstall' : 'action')
          return { ok: false, text: o.action === 'uninstall' ? friendly.message : `${TARGET_LABEL[o.target]}: ${friendly.message}` }
        }),
      }
    })
    setSelected(new Set())
    bumpInstalledVersion()
    setPhase({ kind: 'results', action, rows: result })
  }

  function start(action: BulkAction, targets: Targets = AGENTS.map((a) => a.id)) {
    if (!chosen.length) return
    if (action === 'uninstall') setPhase({ kind: 'confirm', rows: chosen })
    else void run(action, chosen, targets)
  }

  const running = phase?.kind === 'running'
  const close = () => !running && setPhase(null)

  let body = null
  let footer = null
  if (phase?.kind === 'confirm') {
    const skills = phase.rows.some((r) => r.category === 'skill')
    const mcps = phase.rows.some((r) => r.category === 'mcp')
    const restoring = phase.rows.filter((r) => r.replacedFor?.length).length
    body = (
      <>
        <DialogTitle>{t('bulk.unTitle').replace('{0}', String(phase.rows.length))}</DialogTitle>
        <p className="mb-2.5 text-[13px] text-fg-2">{t('bulk.unLede')}</p>
        <ul className="mb-3 max-h-40 overflow-y-auto rounded-[9px] border border-line px-[11px] py-2 text-[12.5px]">
          {phase.rows.map((r) => (
            <li key={r.slug} className="flex gap-2 py-0.5">
              <b className="font-semibold">{r.name}</b>
              <span className="truncate font-mono text-[11.5px] text-fg-3">{r.slug}</span>
            </li>
          ))}
        </ul>
        <Steps
          lines={[
            ...(skills ? [t('bulk.unSkill')] : []),
            ...(mcps ? [t('bulk.unMcp')] : []),
            ...(restoring ? [t('bulk.unRestore').replace('{0}', String(restoring))] : []),
          ]}
        />
        <p className="mt-3 text-[12px] text-fg-3">{t('bulk.unNoForce')}</p>
      </>
    )
    footer = (
      <>
        <Button onClick={close}>{t('common.cancel')}</Button>
        <Button variant="danger" onClick={() => void run('uninstall', phase.rows, [])}>
          {t('bulk.uninstall')}
        </Button>
      </>
    )
  } else if (phase?.kind === 'running') {
    body = (
      <>
        <DialogTitle>{t(`bulk.resultT.${phase.action}`)}</DialogTitle>
        <p role="status" className="flex items-center gap-2 text-[13px] text-fg-2">
          <Spinner />
          {t('bulk.running').replace('{0}', String(phase.count))}
        </p>
      </>
    )
    footer = <Button disabled>{t('ui.close')}</Button>
  } else if (phase?.kind === 'results') {
    const failed = phase.rows.filter((r) => r.lines.some((l) => !l.ok)).length
    body = (
      <>
        <DialogTitle>{t(`bulk.resultT.${phase.action}`)}</DialogTitle>
        <DialogDescription>
          {t('bulk.okCount').replace('{0}', String(phase.rows.length - failed))}
          {failed > 0 && ` · ${t('bulk.failCount').replace('{0}', String(failed))}`}
        </DialogDescription>
        <ul className="mt-2 flex max-h-[320px] flex-col overflow-y-auto rounded-[11px] border border-line">
          {phase.rows.map((r) => {
            const bad = r.lines.some((l) => !l.ok)
            return (
              <li key={r.slug} className="flex items-start gap-2.5 border-b border-line px-[11px] py-2 last:border-b-0">
                <span aria-hidden className={cn('mt-px flex-none font-mono text-xs', bad ? 'text-bad' : 'text-provider')}>
                  {bad ? '✗' : '✓'}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="text-[13px] font-semibold">{r.name}</b>
                  {r.lines.map((l, i) => (
                    <small key={i} className={cn('block break-words text-[11.5px]', l.ok ? 'text-fg-3' : 'text-fg-2')}>
                      {l.text}
                    </small>
                  ))}
                </div>
                {bad && phase.action !== 'uninstall' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setPhase(null)
                      onOpen(r.slug)
                    }}
                  >
                    {t('bulk.view')}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      </>
    )
    footer = <Button onClick={close}>{t('ui.close')}</Button>
  }

  const dialog = (
    <Dialog open={phase !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent aria-describedby={undefined} layer="top" onEscapeKeyDown={(e) => running && e.preventDefault()} onInteractOutside={(e) => running && e.preventDefault()}>
        <DialogBody>{body}</DialogBody>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { selected, chosen, allOn, toggle, toggleAll, clear: () => setSelected(new Set()), start, dialog }
}

export type Bulk = ReturnType<typeof useBulk>

/** Replaces the column header while something is selected. */
export function BulkBar({ bulk }: { bulk: Bulk }) {
  const t = useT()
  const menu = (action: 'enable' | 'disable') => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          {t(`bulk.${action}`)}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => bulk.start(action)}>{t('bulk.forAll')}</DropdownMenuItem>
        {AGENTS.map((a) => (
          <DropdownMenuItem key={a.id} onSelect={() => bulk.start(action, [a.id])}>
            {a.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  return (
    <div role="toolbar" aria-label={t('bulk.selected').replace('{0}', String(bulk.chosen.length))} className="flex flex-1 flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12px] font-semibold text-fg-2">{t('bulk.selected').replace('{0}', String(bulk.chosen.length))}</span>
      {menu('enable')}
      {menu('disable')}
      <Button size="sm" variant="danger" onClick={() => bulk.start('uninstall')}>
        {t('bulk.uninstall')}
      </Button>
      <span className="flex-1" />
      <Button size="sm" variant="ghost" onClick={bulk.clear}>
        {t('bulk.clear')}
      </Button>
    </div>
  )
}
