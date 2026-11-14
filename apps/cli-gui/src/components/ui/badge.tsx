import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'pro' | 'dashed'

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-panel text-fg-2',
  ok: 'border-provider/40 bg-provider/[0.08] text-provider',
  warn: 'border-warn/40 bg-warn/[0.08] text-warn',
  bad: 'border-bad/40 bg-bad/[0.08] text-bad',
  pro: 'border-skill/45 bg-skill/10 font-bold text-skill',
  dashed: 'border-dashed border-line-strong text-fg-3',
}

export function Badge({ tone = 'neutral', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full border px-2 text-[11.5px] [&_svg]:h-3 [&_svg]:w-3',
        TONES[tone],
        className
      )}
      {...rest}
    />
  )
}

export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-grid h-5 min-w-5 place-items-center whitespace-nowrap rounded-md border border-b-2 border-line-strong bg-white/5 px-[5px] font-mono text-[11px] font-medium leading-none text-fg-2',
        className
      )}
      {...rest}
    />
  )
}

type Kind = 'skill' | 'mcp' | 'provider'

/** Category color dot + label. Category color marks the category only, never state. */
export function KindLabel({ kind, children }: { kind: Kind; children: React.ReactNode }) {
  return (
    <span data-kind={kind} className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-semibold text-kind">
      <span className="h-1.5 w-1.5 rounded-[2px] bg-kind" />
      {children}
    </span>
  )
}
