import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from './cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  mono?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, mono, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-[34px] w-full rounded-[9px] border bg-black/25 px-2.5 text-[13px] text-fg transition-[border-color,box-shadow] duration-150 placeholder:text-fg-3 hover:border-line-strong focus:border-mcp/70 focus:shadow-[0_0_0_3px_rgb(var(--mcp-rgb)/0.16)] focus:outline-none disabled:opacity-45',
        invalid ? 'border-bad/70' : 'border-line',
        fit ? 'w-auto' : 'w-full',
        mono && 'font-mono text-[12.5px]',
        className
      )}
      {...rest}
    />
  )
})

/** An input with a leading icon, e.g. a search field. */
export function InputWithIcon({ icon, className, ...rest }: InputProps & { icon: ReactNode }) {
  return (
    <div className={cn('relative min-w-[180px] flex-1', className)}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3 [&_svg]:h-[15px] [&_svg]:w-[15px]">
        {icon}
      </span>
      <Input className="pl-8" {...rest} />
    </div>
  )
}

/** A native select in the input's frame; the OS draws the option list. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { mono?: boolean; fit?: boolean }>(function Select(
  { mono, fit, className, ...rest },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-[34px] rounded-[9px] border border-line bg-black/25 px-2 text-[13px] text-fg transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-mcp/70 focus:shadow-[0_0_0_3px_rgb(var(--mcp-rgb)/0.16)] focus:outline-none disabled:opacity-45',
        fit ? 'w-auto' : 'w-full',
        mono && 'font-mono text-[12.5px]',
        className
      )}
      {...rest}
    />
  )
})
