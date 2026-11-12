import type { Engine, ResourceKind } from '@as/types'
import { formatDownloads } from '../utils/format'

const KINDS: readonly string[] = ['skill', 'mcp', 'provider']

const SOURCE: Record<string, string> = { 'mcp-registry': 'MCP Registry', github: 'GitHub', builtin: 'built-in' }

export async function runSearch(
  engine: Engine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<void> {
  const words: string[] = []
  let kind: ResourceKind | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--kind') {
      const k = args[++i]
      if (!k || !KINDS.includes(k)) {
        out('Usage: aas search [query] [--kind <skill|mcp|provider>]')
        return
      }
      kind = k as ResourceKind
    } else words.push(args[i])
  }
  const result = await engine.search(words.join(' '), { category: kind, limit: 20 })
  if (result.offline) out('  (the catalog could not be reached; showing the last cached results)\n')
  if (!result.resources.length) {
    out('No results.')
    return
  }
  result.resources.forEach((r, i) => {
    const facts = [r.kind, SOURCE[r.origin.site] ?? r.origin.site, ...(r.verified ? ['verified'] : []), ...(r.installs != null ? [`${formatDownloads(r.installs)} installs`] : [])]
    out(`${r.name}   ${facts.join(' · ')}`)
    if (r.description) out(`  ${r.description.length > 160 ? `${r.description.slice(0, 157)}...` : r.description}`)
    out(`  aas install ${r.id}`)
    if (i < result.resources.length - 1) out('')
  })
  if (result.nextOffset !== null) out('\n  More results: narrow the query, or add --kind.')
}
