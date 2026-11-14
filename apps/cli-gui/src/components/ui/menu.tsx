import * as Menu from '@radix-ui/react-dropdown-menu'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from 'react'
import { cn } from './cn'

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger

export const DropdownMenuContent = forwardRef<ElementRef<typeof Menu.Content>, ComponentPropsWithoutRef<typeof Menu.Content>>(
  function DropdownMenuContent({ className, sideOffset = 6, collisionPadding = 8, ...rest }, ref) {
    return (
      <Menu.Portal>
        <Menu.Content
          ref={ref}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          className={cn(
            'as-pop z-[80] min-w-[220px] rounded-box border border-line-strong bg-popover p-1.5 text-fg shadow-[0_20px_60px_rgba(0,0,0,0.6)] focus:outline-none',
            className
          )}
          {...rest}
        />
      </Menu.Portal>
    )
  }
)

const ITEM =
  'flex h-[34px] w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-fg-2 outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-panel-2 data-[highlighted]:text-fg [&_svg]:h-[15px] [&_svg]:w-[15px]'

export const DropdownMenuItem = forwardRef<ElementRef<typeof Menu.Item>, ComponentPropsWithoutRef<typeof Menu.Item>>(
  function DropdownMenuItem({ className, ...rest }, ref) {
    return <Menu.Item ref={ref} className={cn(ITEM, className)} {...rest} />
  }
)

export const DropdownMenuRadioGroup = Menu.RadioGroup

export const DropdownMenuRadioItem = forwardRef<ElementRef<typeof Menu.RadioItem>, ComponentPropsWithoutRef<typeof Menu.RadioItem>>(
  function DropdownMenuRadioItem({ className, children, ...rest }, ref) {
    return (
      <Menu.RadioItem ref={ref} className={cn(ITEM, 'data-[state=checked]:text-fg', className)} {...rest}>
        <span className="flex-1">{children}</span>
        <Menu.ItemIndicator className="text-mcp">✓</Menu.ItemIndicator>
      </Menu.RadioItem>
    )
  }
)

export function DropdownMenuSeparator() {
  return <Menu.Separator className="mx-1.5 my-[5px] h-px bg-line" />
}

export function DropdownMenuLabel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <Menu.Label className={cn('px-2.5 pb-2.5 pt-2 text-xs text-fg-3', className)} {...rest} />
}
