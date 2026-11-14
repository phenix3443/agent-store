import type { ReactNode } from 'react'
import { Glyph } from '../ui/icons'
import { cn } from '../ui/cn'

/** The folder tile of a project: neutral, since category colors mean only skill / MCP / provider. */
export function FolderTile({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center border border-line-strong bg-panel-2 text-fg-2',
        size === 'lg' ? 'h-12 w-12 rounded-[13px]' : 'h-9 w-9 rounded-ctl'
      )}
    >
      <Glyph name="folder" className={size === 'lg' ? 'h-6 w-6' : 'h-[18px] w-[18px]'} />
    </span>
  )
}

/** A list row that is not one big button: the project page's items have no detail pane. */
export function PlainRow({
  lead,
  title,
  chips,
  sub,
  right,
  below,
  kind,
}: {
  lead: ReactNode
  title: ReactNode
  chips?: ReactNode
  sub?: ReactNode
  right?: ReactNode
  below?: ReactNode
  kind?: 'skill' | 'mcp'
}) {
  return (
    <div data-kind={kind} className="border-b border-line last:border-b-0">
      <div className="flex min-h-[58px] items-center gap-3 px-3 py-2.5">
        {lead}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] font-semibold">
            <span className="truncate">{title}</span>
            {chips}
          </div>
          {sub && <div className="mt-0.5 text-xs text-fg-3">{sub}</div>}
        </div>
        {right && <div className="flex flex-none flex-wrap items-center justify-end gap-1.5">{right}</div>}
      </div>
      {below}
    </div>
  )
}

/** A heading above one block of the project page, with the count and where the items live. */
export function BlockHeading({ kind, title, count, where }: { kind?: 'skill' | 'mcp'; title: string; count?: number; where?: string }) {
  return (
    <h2 data-kind={kind} className="mb-2 mt-[18px] flex flex-wrap items-center gap-2 text-[12.5px] font-semibold">
      <span className={kind ? 'text-kind' : undefined}>{title}</span>
      {count !== undefined && <small className="font-mono text-[11px] font-normal text-fg-3">{count}</small>}
      <span className="flex-1" />
      {where && <small className="font-mono text-[11px] font-normal text-fg-3">{where}</small>}
    </h2>
  )
}
