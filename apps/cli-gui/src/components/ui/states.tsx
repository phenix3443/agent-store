import type { ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { CategoryIcon } from '../CategoryIcon'
import { cn } from './cn'

type Kind = 'skill' | 'mcp' | 'provider'

export function EmptyState({ kind, title, body, action }: { kind?: Kind; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-box border border-dashed border-line-strong px-5 py-14 text-center text-fg-2">
      {kind && (
        <div className="mb-1.5">
          <CategoryIcon category={kind} size="lg" />
        </div>
      )}
      <b className="text-[14.5px] text-fg">{title}</b>
      {body && <p className="max-w-[44ch] text-[12.5px] text-fg-3">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('as-skeleton', className)} />
}

/** Placeholder rows while a list loads. */
export function LoadingRows({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col overflow-hidden rounded-box border border-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-[58px] items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
          <Skeleton className="h-9 w-9 rounded-ctl" />
          <div className="flex-1">
            <Skeleton className="h-3" />
            <Skeleton className="mt-2 h-2.5 w-3/4" />
          </div>
          <Skeleton className="h-[26px] w-[58px]" />
        </div>
      ))}
    </div>
  )
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      className={cn('as-spin inline-block h-4 w-4 flex-none rounded-full border-2 border-line-strong border-t-fg', className)}
    />
  )
}

export type BannerTone = 'warn' | 'error' | 'info'

const BANNER_TONES: Record<BannerTone, { box: string; icon: string }> = {
  warn: { box: 'border-warn/35 bg-warn/[0.07]', icon: 'text-warn' },
  error: { box: 'border-bad/40 bg-bad/[0.08]', icon: 'text-bad' },
  info: { box: 'border-line-strong bg-panel', icon: 'text-fg-2' },
}

/** Inline notice for a whole area: offline catalog, a failed load, a refused action. */
export function Banner({ tone = 'warn', title, children, actions }: { tone?: BannerTone; title?: string; children?: ReactNode; actions?: ReactNode }) {
  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-ctl border px-3 py-[9px] text-[12.5px] text-fg', BANNER_TONES[tone].box)}
    >
      <Icon size={15} className={cn('mt-0.5 flex-none', BANNER_TONES[tone].icon)} />
      <div className="min-w-0 flex-1">
        {title && <b className="font-semibold">{title}</b>}
        {children && <div className="text-fg-2">{children}</div>}
        {actions && <div className="mt-2 flex flex-wrap gap-1.5">{actions}</div>}
      </div>
    </div>
  )
}
