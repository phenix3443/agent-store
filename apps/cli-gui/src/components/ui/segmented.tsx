import { cn } from './cn'

/** A few mutually exclusive choices shown at once, e.g. a time range or the language. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex gap-0.5 rounded-ctl border border-line bg-panel p-[3px]', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-[26px] whitespace-nowrap rounded-[7px] px-2.5 text-[12.5px] font-semibold transition-colors',
            value === o.value ? 'bg-white/[0.12] text-fg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-fg-2 hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
