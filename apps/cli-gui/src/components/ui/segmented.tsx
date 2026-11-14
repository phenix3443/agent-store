import type { ReactNode } from 'react'
import { cn } from './cn'

type Kind = 'skill' | 'mcp' | 'provider'

export interface SegmentOption<T extends string | number> {
  value: T
  label: ReactNode
  /** Tints the selected segment with that category's color. */
  kind?: Kind
}

/** A few mutually exclusive choices shown at once (a filter, a time range, the language); each is a toggle button. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex gap-0.5 rounded-ctl border border-line bg-panel p-[3px]', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            data-kind={o.kind}
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 text-[12.5px] font-semibold transition-colors',
              on
                ? o.kind
                  ? 'bg-kind/20 text-fg shadow-[inset_0_0_0_1px_rgb(var(--kind-rgb)/0.45)]'
                  : 'bg-white/[0.12] text-fg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                : 'text-fg-2 hover:text-fg'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
