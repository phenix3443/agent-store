import * as SwitchPrimitive from '@radix-ui/react-switch'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { cn } from './cn'

type Kind = 'skill' | 'mcp' | 'provider'

/** On/off for one agent; the checked track takes the category color. */
export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & { kind?: Kind; busy?: boolean }
>(function Switch({ kind, busy, className, ...rest }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      data-kind={kind}
      aria-busy={busy || undefined}
      className={cn(
        'relative h-[19px] w-8 flex-none rounded-full bg-white/[0.14] transition-[background,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-35',
        'data-[state=checked]:bg-kind data-[state=checked]:shadow-[0_0_12px_rgb(var(--kind-rgb)/0.45)]',
        busy && 'cursor-progress',
        className
      )}
      {...rest}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block h-[15px] w-[15px] translate-x-0.5 rounded-full bg-fg transition-transform duration-200 ease-out data-[state=checked]:translate-x-[15px]',
          busy && 'opacity-60'
        )}
      />
    </SwitchPrimitive.Root>
  )
})
