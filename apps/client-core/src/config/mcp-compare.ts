// The comparison rule for MCP entries (docs/global-skills-mcp.md §5.5): drop
// `args: []`, `env: {}` and, for Claude, `headers: {}`; nothing else is
// normalized. Both CLIs write those empties differently from a hand-written
// entry with no change in behavior.
import type { ToolTarget } from '@as/types'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a).sort()
    const kb = Object.keys(b).sort()
    return deepEqual(ka, kb) && ka.every(k => deepEqual(a[k], b[k]))
  }
  return Object.is(a, b)
}

export function canonicalMcpEntry(tool: ToolTarget, entry: unknown): unknown {
  if (!isPlainObject(entry)) return entry
  const out: Record<string, unknown> = { ...entry }
  if (Array.isArray(out['args']) && out['args'].length === 0) delete out['args']
  const emptyObjectKeys = tool === 'claude' ? ['env', 'headers'] : ['env']
  for (const key of emptyObjectKeys) {
    const v = out[key]
    if (isPlainObject(v) && Object.keys(v).length === 0) delete out[key]
  }
  return out
}

export function mcpEntriesEqual(tool: ToolTarget, a: unknown, b: unknown): boolean {
  return deepEqual(canonicalMcpEntry(tool, a), canonicalMcpEntry(tool, b))
}

/** Top-level keys whose canonical values differ (what a restore would lose or change). */
export function mcpEntryDiff(tool: ToolTarget, expected: unknown, actual: unknown): string[] {
  const e = canonicalMcpEntry(tool, expected)
  const a = canonicalMcpEntry(tool, actual)
  if (!isPlainObject(e) || !isPlainObject(a)) return deepEqual(e, a) ? [] : ['(entry)']
  return [...new Set([...Object.keys(e), ...Object.keys(a)])].filter(k => !deepEqual(e[k], a[k])).sort()
}
