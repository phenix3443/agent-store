import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export const TooltipProvider = TooltipPrimitive.Provider

/** A hover/focus label. With `disabled` it renders only the trigger, e.g. when the label is already visible. */
export function Tooltip({ label, side = 'right', disabled, children }: { label: string; side?: 'top' | 'right' | 'bottom' | 'left'; disabled?: boolean; children: ReactNode }) {
  if (disabled) return <>{children}</>
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          collisionPadding={8}
          className="z-[80] rounded-lg border border-line-strong bg-popover px-2 py-1 text-xs text-fg shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
