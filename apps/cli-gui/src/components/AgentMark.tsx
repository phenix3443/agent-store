import { cn } from './ui/cn'

export function AgentMark({ mark, soon }: { mark: string; soon?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid h-6 w-6 flex-none place-items-center rounded-[7px] border border-line-strong bg-panel-2 font-mono text-[10px] font-bold',
        soon && 'border-dashed text-fg-3'
      )}
    >
      {mark}
    </span>
  )
}
