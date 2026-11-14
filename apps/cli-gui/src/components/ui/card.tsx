import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-box border border-line bg-panel p-4', className)} {...rest} />
}

/** A card heading with optional trailing actions pushed to the right. */
export function CardTitle({ children, actions, className }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <h3 className="flex items-center gap-2 text-[13.5px] font-bold">{children}</h3>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  )
}

/** A label above a big number. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-box border border-line bg-panel px-3.5 py-3">
      <small className="block text-[11.5px] text-fg-3">{label}</small>
      <b className="mt-0.5 block text-xl font-extrabold tabular-nums">{value}</b>
    </div>
  )
}

/** A settings-style list: rows separated by lines inside one frame. */
export function RowGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-4 flex flex-col overflow-hidden rounded-box border border-line', className)}>{children}</div>
}

export function Row({ title, sub, children, muted }: { title: ReactNode; sub?: ReactNode; children?: ReactNode; muted?: boolean }) {
  return (
    <div className={cn('flex min-h-[54px] items-center gap-3 border-b border-line px-3.5 py-[11px] last:border-b-0', muted && 'opacity-60')}>
      <div className="min-w-0 flex-1">
        <b className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">{title}</b>
        {sub && <small className="mt-0.5 block text-xs text-fg-3">{sub}</small>}
      </div>
      {children && <div className="flex flex-none flex-wrap items-center justify-end gap-1.5">{children}</div>}
    </div>
  )
}
