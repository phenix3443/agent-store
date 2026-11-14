import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'default' | 'primary' | 'kind' | 'danger' | 'ghost'
export type ButtonSize = 'md' | 'sm'

const VARIANTS: Record<ButtonVariant, string> = {
  default: 'border-line-strong bg-panel hover:enabled:bg-panel-2 hover:enabled:border-white/30',
  primary:
    'border-transparent bg-fg text-canvas shadow-[0_6px_22px_rgb(var(--mcp-rgb)/0.22)] hover:enabled:bg-white hover:enabled:shadow-[0_8px_28px_rgb(var(--mcp-rgb)/0.4)]',
  kind: 'border-kind/50 bg-kind/15 hover:enabled:border-kind/70 hover:enabled:bg-kind/30',
  danger: 'border-bad/40 bg-bad/10 text-bad hover:enabled:border-bad/60 hover:enabled:bg-bad/20',
  ghost: 'border-transparent bg-transparent text-fg-2 hover:enabled:bg-panel-2 hover:enabled:text-fg',
}

const SIZES: Record<ButtonSize, { text: string; icon: string }> = {
  md: { text: 'h-8 gap-[7px] rounded-[9px] px-[13px] text-[13px]', icon: 'h-8 w-8 rounded-[9px]' },
  sm: { text: 'h-[26px] gap-1.5 rounded-[7px] px-[9px] text-xs', icon: 'h-[26px] w-[26px] rounded-[7px]' },
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Square button holding only an icon; give it an aria-label. */
  icon?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', icon = false, className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap border font-semibold leading-none transition-[background,border-color,box-shadow,transform] duration-150 ease-out active:enabled:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:shrink-0',
        VARIANTS[variant],
        icon ? SIZES[size].icon : SIZES[size].text,
        className
      )}
      {...rest}
    />
  )
})
