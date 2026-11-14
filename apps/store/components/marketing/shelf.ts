// Plain module: a server page cannot read values exported from a 'use client' file.
import type { ResourceKind, ResourceSummary } from '@as/types'
import { installCommand } from '@/lib/resource'

export const SHELF_KINDS: ResourceKind[] = ['skill', 'mcp', 'provider']

/** Lines drawn on the lower half of a card, taken from the record itself. */
export function cardArt(r: ResourceSummary): { big: string; lines: string[] } {
  const command = installCommand(r)
  if (r.kind === 'skill') {
    return { big: 'SKILL.md', lines: [r.origin.upstreamId, ...(command ? [command] : [])] }
  }
  if (r.kind === 'mcp') {
    return {
      big: r.transports[0] ?? 'mcp',
      lines: [r.origin.upstreamId, ...r.transports.slice(1), ...(r.version ? [`v${r.version.replace(/^v/, '')}`] : [])],
    }
  }
  return { big: r.origin.upstreamId, lines: [...(command ? [command] : []), ...r.tags.slice(0, 3)] }
}
