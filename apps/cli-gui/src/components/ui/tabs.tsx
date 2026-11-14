import * as TabsPrimitive from '@radix-ui/react-tabs'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { cn } from './cn'

export const Tabs = TabsPrimitive.Root
export const TabsContent = TabsPrimitive.Content

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  function TabsList({ className, ...rest }, ref) {
    return (
      <TabsPrimitive.List
        ref={ref}
        className={cn('inline-flex flex-wrap gap-0.5 rounded-ctl border border-line bg-panel p-[3px]', className)}
        {...rest}
      />
    )
  }
)

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
  function TabsTrigger({ className, ...rest }, ref) {
    return (
      <TabsPrimitive.Trigger
        ref={ref}
        className={cn(
          'h-[26px] whitespace-nowrap rounded-[7px] px-2.5 text-[12.5px] font-semibold text-fg-2 transition-colors hover:text-fg',
          'data-[state=active]:bg-white/[0.12] data-[state=active]:text-fg data-[state=active]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]',
          className
        )}
        {...rest}
      />
    )
  }
)
