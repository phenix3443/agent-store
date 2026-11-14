import { useEffect, useRef, type ReactNode } from 'react'
import { Copy, X } from 'lucide-react'
import { useT } from '../../i18n'
import { AGENTS, type AgentMeta } from '../../lib/agents'
import { NARROW_QUERY, useMediaQuery } from '../../lib/useMediaQuery'
import { CategoryIcon } from '../CategoryIcon'
import { Button } from '../ui/button'
import { Banner } from '../ui/states'
import { Switch } from '../ui/switch'
import { toast } from '../ui/toast'
import { Tooltip } from '../ui/tooltip'
import { cn } from '../ui/cn'
import type { ToggleFailure } from './useTargetToggle'

type Kind = 'skill' | 'mcp' | 'provider'

/** A page: the scrolling view, plus the detail pane on the right (over the view in a narrow window). */
export function PageWithPane({ view, pane }: { view: ReactNode; pane: ReactNode }) {
  return (
    <div className="relative flex min-w-0 flex-1">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-[22px] pb-6 pt-[18px]">{view}</div>
      {pane}
    </div>
  )
}

export function ViewHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-3.5 flex flex-wrap items-end gap-3">
      <div>
        <h1 className="text-[19px] font-extrabold leading-[1.3]">{title}</h1>
        {sub && <p className="mb-0.5 text-[12.5px] text-fg-3">{sub}</p>}
      </div>
      <span className="flex-1" />
      {actions}
    </div>
  )
}

/** Detail pane frame. Esc closes it unless a dialog or menu is open. */
export function DetailPane({
  label,
  kind,
  status,
  onClose,
  children,
}: {
  label: string
  kind: Kind
  status?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const t = useT()
  const narrow = useMediaQuery(NARROW_QUERY)
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape' || document.querySelector('[role="dialog"], [role="menu"]')) return
      closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <aside
      ref={ref}
      aria-label={label}
      data-kind={kind}
      className={cn(
        'flex min-h-0 w-[430px] flex-none flex-col border-l border-line',
        narrow ? 'absolute inset-y-0 right-0 z-20 max-w-full bg-canvas-3 shadow-[-20px_0_60px_rgba(0,0,0,0.45)]' : 'bg-black/[0.14]'
      )}
    >
      <div className="flex h-10 flex-none items-center gap-2 border-b border-line pl-4 pr-2 font-mono text-[11.5px] font-medium text-fg-3">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {status}
        <Button size="sm" icon variant="ghost" aria-label={`${t('ui.close')} (Esc)`} title={`${t('ui.close')} (Esc)`} onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-6 pt-[18px]">{children}</div>
    </aside>
  )
}

export function PaneHead({ kind, title, by }: { kind: Kind; title: ReactNode; by?: ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      <CategoryIcon category={kind} size="lg" />
      <div className="min-w-0">
        <h2 className="break-words text-[17px] font-extrabold leading-[1.3]">{title}</h2>
        {by && <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-fg-3">{by}</div>}
      </div>
    </div>
  )
}

export function Section({ title, extra, children, className }: { title: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mt-5', className)}>
      <h3 className="mb-2 flex items-center gap-2 text-[11.5px] font-semibold text-fg-3">
        {title}
        {extra && <span className="flex-1" />}
        {extra}
      </h3>
      {children}
    </section>
  )
}

export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[12.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="whitespace-nowrap text-fg-3">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Steps({ lines, className }: { lines: string[]; className?: string }) {
  return (
    <ul className={cn('flex flex-col gap-[5px] break-all rounded-[9px] border border-line bg-code px-[11px] py-[9px] font-mono text-xs leading-[1.6] text-fg-2', className)}>
      {lines.map((line, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className="flex-none text-kind">
            ›
          </span>
          <span className="min-w-0">{line}</span>
        </li>
      ))}
    </ul>
  )
}

export function copyText(text: string, t: (k: string) => string) {
  const done = navigator.clipboard?.writeText(text)
  if (!done) return toast.error(t('ui.copyFail'))
  done.then(
    () => toast(t('ui.copied')),
    () => toast.error(t('ui.copyFail'))
  )
}

/** A command or path in a code box, with a copy button. */
export function CodeLine({ text, prompt, extra }: { text: string; prompt?: boolean; extra?: ReactNode }) {
  const t = useT()
  return (
    <div className="relative flex items-start gap-1.5 whitespace-pre-wrap break-all rounded-[9px] border border-line bg-code py-[9px] pl-[11px] pr-2 font-mono text-xs leading-[1.65] text-fg">
      <span className="min-w-0 flex-1 pt-px">
        {prompt && <span className="text-kind">$ </span>}
        {text}
      </span>
      {extra}
      <Button size="sm" icon aria-label={t('act.copy')} title={t('act.copy')} onClick={() => copyText(text, t)}>
        <Copy />
      </Button>
    </div>
  )
}

export function AgentMark({ agent }: { agent: Pick<AgentMeta, 'mark'> | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid h-6 w-6 flex-none place-items-center rounded-[7px] border bg-panel-2 font-mono text-[10px] font-bold',
        agent ? 'border-line-strong text-fg-2' : 'border-dashed border-line-strong text-fg-3'
      )}
    >
      {agent ? agent.mark : '+'}
    </span>
  )
}

export interface AgentLine {
  agent: AgentMeta
  /** What the row says under the agent name. */
  note: string
  noteMono?: boolean
  right: ReactNode
}

/** One row per supported agent, plus the 更多即将支持 row. */
export function AgentList({ lines }: { lines: AgentLine[] }) {
  const t = useT()
  return (
    <div className="flex flex-col overflow-hidden rounded-[11px] border border-line">
      {lines.map(({ agent, note, noteMono, right }) => (
        <div key={agent.id} className="flex min-h-12 items-center gap-2.5 border-b border-line px-[11px] py-[9px]">
          <AgentMark agent={agent} />
          <div className="min-w-0 flex-1 leading-[1.3]">
            <b className="text-[13px] font-semibold">{agent.name}</b>
            <small className={cn('block break-words text-[11.5px] text-fg-3', noteMono && 'font-mono text-[11px]')}>{note}</small>
          </div>
          {right}
        </div>
      ))}
      <div className="flex min-h-12 items-center gap-2.5 border-t border-dashed border-line-strong px-[11px] py-[9px] text-fg-3 -mt-px">
        <AgentMark agent={null} />
        <div className="min-w-0 flex-1 leading-[1.3]">
          <b className="text-[13px] font-semibold">{t('ag.soon')}</b>
          <small className="block text-[11.5px]">{t('ag.soonD')}</small>
        </div>
      </div>
    </div>
  )
}

/** The switch of one entry for one agent, with the reason in a tooltip when it can't be switched on. */
export function AgentSwitch({
  kind,
  agent,
  itemName,
  checked,
  reason,
  busy,
  onToggle,
}: {
  kind: Kind
  agent: AgentMeta
  itemName: string
  checked: boolean
  reason?: string
  busy?: boolean
  onToggle: () => void
}) {
  const t = useT()
  const disabled = !checked && !!reason
  const label = reason && disabled ? reason : t(checked ? 'ag.swOff' : 'ag.swOn').replace('{0}', agent.name)
  return (
    <Tooltip label={label} side="top">
      <span className="inline-flex">
        <Switch
          kind={kind}
          checked={checked}
          busy={busy}
          disabled={disabled || busy}
          aria-label={`${agent.name} · ${itemName}`}
          onCheckedChange={() => onToggle()}
        />
      </span>
    </Tooltip>
  )
}

export function ErrorDetails({ detail }: { detail?: string }) {
  const t = useT()
  if (!detail) return null
  return (
    <details className="mt-1 text-[11.5px] text-fg-3">
      <summary className="cursor-pointer hover:text-fg-2">{t('errors.details')}</summary>
      <code className="mt-1 block whitespace-pre-wrap break-all font-mono">{detail}</code>
    </details>
  )
}

export function FailureBanner({
  failure,
  onForce,
  onReplace,
  onDismiss,
  forceLabel,
}: {
  failure: Pick<ToggleFailure, 'lead' | 'message' | 'detail' | 'forceable'> & { replaceable?: boolean }
  onForce?: () => void
  onReplace?: () => void
  onDismiss: () => void
  forceLabel?: string
}) {
  const t = useT()
  return (
    <Banner
      tone="error"
      title={failure.lead}
      actions={
        <>
          {failure.forceable && onForce && (
            <Button size="sm" variant="danger" onClick={onForce}>
              {forceLabel ?? t('catalog.forceEnable')}
            </Button>
          )}
          {failure.replaceable && onReplace && (
            <Button size="sm" variant="kind" data-kind="mcp" onClick={onReplace}>
              {t('takeover.btn')}
            </Button>
          )}
          <Button size="sm" onClick={onDismiss}>
            {t('ui.close')}
          </Button>
        </>
      }
    >
      <p>{failure.message}</p>
      <ErrorDetails detail={failure.detail} />
    </Banner>
  )
}

/** Column header of a library list: the count, then one column per agent; `bar` (bulk actions) takes their place. */
export function AgentColumns({ label, trailing, lead, bar }: { label: string; trailing?: ReactNode; lead?: ReactNode; bar?: ReactNode }) {
  const t = useT()
  if (bar) {
    return (
      <div className="flex min-h-[30px] flex-wrap items-center gap-2 px-3 pb-1.5 text-[11.5px] text-fg-3">
        {lead}
        {bar}
      </div>
    )
  }
  return (
    <div className="flex min-h-[30px] items-center gap-3 px-3 pb-1.5 text-[11.5px] text-fg-3">
      {lead}
      <span className="flex-1">{label}</span>
      {AGENTS.map((a) => (
        <span key={a.id} className="w-[78px] flex-none text-center max-[1040px]:w-[64px]">
          {a.name}
        </span>
      ))}
      <span className="flex w-[112px] flex-none justify-end">
        {trailing ?? (
          <span title={t('ag.soonD')} className="inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-line-strong px-2 text-[11.5px] text-fg-3">
            + {t('ag.soon')}
          </span>
        )}
      </span>
    </div>
  )
}

/** A list row whose main area is one button (it opens the detail); the controls on the right sit above it. */
export function ListRow({
  kind,
  selected,
  onOpen,
  lead,
  title,
  chips,
  sub,
  subMono,
  right,
  dim,
  select,
}: {
  kind: Kind
  selected: boolean
  onOpen: () => void
  /** A checkbox for bulk actions, before the row's main button. */
  select?: ReactNode
  lead?: ReactNode
  title: string
  chips?: ReactNode
  sub?: string
  subMono?: boolean
  right?: ReactNode
  dim?: boolean
}) {
  return (
    <div
      data-kind={kind}
      className={cn(
        'relative flex min-h-[58px] items-center gap-3 border-b border-line px-3 py-2.5 transition-colors last:border-b-0 hover:bg-panel',
        'has-[[data-row-main]:focus-visible]:rounded-ctl has-[[data-row-main]:focus-visible]:outline has-[[data-row-main]:focus-visible]:outline-2 has-[[data-row-main]:focus-visible]:-outline-offset-2 has-[[data-row-main]:focus-visible]:outline-mcp',
        selected && 'bg-kind/[0.09] before:absolute before:bottom-2.5 before:left-0 before:top-2.5 before:w-[3px] before:rounded-r-[3px] before:bg-kind before:shadow-[0_0_10px_rgb(var(--kind-rgb)/0.8)]'
      )}
    >
      {select && <div className="relative z-[1] flex flex-none items-center">{select}</div>}
      <button
        type="button"
        data-row-main
        aria-current={selected || undefined}
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left after:absolute after:inset-0 focus-visible:outline-none"
      >
        {lead}
        <span className={cn('contents', dim && '[&>*]:opacity-55')}>
          <CategoryIcon category={kind} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[13.5px] font-semibold">
              <span className="truncate">{title}</span>
              {chips}
            </span>
            {sub && <span className={cn('block truncate text-xs text-fg-3', subMono && 'font-mono text-[11.5px]')}>{sub}</span>}
          </span>
        </span>
      </button>
      {right && <div className="relative z-[1] flex flex-none items-center gap-2">{right}</div>}
    </div>
  )
}

export function ListBox({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div aria-label={label} className="flex flex-col overflow-hidden rounded-box border border-line bg-white/[0.015]">
      {children}
    </div>
  )
}
