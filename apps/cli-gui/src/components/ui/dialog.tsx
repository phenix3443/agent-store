import * as DialogPrimitive from '@radix-ui/react-dialog'
import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes, type ElementRef } from 'react'
import { cn } from './cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const DialogTitle = forwardRef<ElementRef<typeof DialogPrimitive.Title>, ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  function DialogTitle({ className, ...rest }, ref) {
    return <DialogPrimitive.Title ref={ref} className={cn('mb-1 text-base font-extrabold text-fg', className)} {...rest} />
  }
)
export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...rest }, ref) {
  return <DialogPrimitive.Description ref={ref} className={cn('mb-3.5 text-[13px] text-fg-2', className)} {...rest} />
})

export type DialogWidth = 'md' | 'wide' | 'palette'

const WIDTHS: Record<DialogWidth, string> = {
  md: 'w-[min(480px,calc(100vw-32px))]',
  wide: 'w-[min(680px,calc(100vw-32px))]',
  palette: 'w-[min(600px,calc(100vw-32px))]',
}

export interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  width?: DialogWidth
  /** Stack above another open dialog (an install link can arrive while one is open). */
  layer?: 'base' | 'top'
  /** 'top' pins the panel near the top so a growing list doesn't move its input (the palette). */
  placement?: 'center' | 'top'
}

/** Overlay plus the framed panel. Children are usually DialogBody and DialogFooter. */
export const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(function DialogContent(
  { width = 'md', layer = 'base', placement = 'center', className, children, ...rest },
  ref
) {
  const z = layer === 'top' ? 'z-[70]' : 'z-[60]'
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={cn('fixed inset-0 bg-scrim backdrop-blur-[3px]', z)} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'as-pop fixed left-1/2 flex max-h-[min(620px,calc(100vh-48px))] -translate-x-1/2 flex-col overflow-hidden rounded-overlay border border-line-strong bg-overlay text-fg shadow-[0_30px_100px_rgba(0,0,0,0.7)] focus:outline-none',
          placement === 'top' ? 'top-[12vh]' : 'top-1/2 -translate-y-1/2',
          WIDTHS[width],
          z,
          className
        )}
        {...rest}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})

export function DialogBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-y-auto px-5 pb-4 pt-5', className)} {...rest} />
}

export function DialogFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-none items-center justify-end gap-2 border-t border-line px-5 py-3', className)} {...rest} />
}
