// Read-only access to the tool config files, plus the comparison rule of §5.5.
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { Roots } from './roots'

export function sha256File(path: string): string | null {
  if (!existsSync(path)) return null
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function readClaudeJson(r: Roots): Record<string, unknown> {
  if (!existsSync(r.claudeJson)) return {}
  return JSON.parse(readFileSync(r.claudeJson, 'utf-8')) as Record<string, unknown>
}

export function claudeMcpServers(r: Roots): Record<string, unknown> {
  return (readClaudeJson(r)['mcpServers'] as Record<string, unknown> | undefined) ?? {}
}

export function writeClaudeMcpServers(r: Roots, servers: Record<string, unknown>): void {
  const config = existsSync(r.claudeJson) ? readClaudeJson(r) : {}
  config['mcpServers'] = servers
  mkdirSync(dirname(r.claudeJson), { recursive: true })
  writeFileSync(r.claudeJson, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export const codexConfigPath = (r: Roots) => join(r.codexHome, 'config.toml')

export function readCodexConfig(r: Roots): Record<string, unknown> {
  const path = codexConfigPath(r)
  if (!existsSync(path)) return {}
  return Bun.TOML.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
}

export function codexMcpServers(r: Roots): Record<string, unknown> {
  return (readCodexConfig(r)['mcp_servers'] as Record<string, unknown> | undefined) ?? {}
}

export function writeCodexConfig(r: Roots, text: string): void {
  mkdirSync(r.codexHome, { recursive: true })
  writeFileSync(codexConfigPath(r), text)
}

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

/**
 * §5.5 comparison rule: drop `args: []`, `env: {}` and (Claude only)
 * `headers: {}`; everything else must match exactly.
 */
export function canonicalEntry(tool: 'claude' | 'codex', entry: unknown): unknown {
  if (!isPlainObject(entry)) return entry
  const out: Record<string, unknown> = { ...entry }
  const emptyKeys = tool === 'claude' ? ['args', 'env', 'headers'] : ['args', 'env']
  for (const key of emptyKeys) {
    const v = out[key]
    if ((Array.isArray(v) && v.length === 0) || (key !== 'args' && isPlainObject(v) && Object.keys(v).length === 0)) {
      delete out[key]
    }
  }
  return out
}

export function equalUnderRule(tool: 'claude' | 'codex', a: unknown, b: unknown): boolean {
  return deepEqual(canonicalEntry(tool, a), canonicalEntry(tool, b))
}

export function readRegistry(r: Roots): { installed: Array<{ slug: string; enabledFor: Record<string, boolean> }> } {
  const path = join(r.asHome, 'registry.json')
  if (!existsSync(path)) return { installed: [] }
  return JSON.parse(readFileSync(path, 'utf-8'))
}

export function registryEntry(r: Roots, slug: string) {
  return readRegistry(r).installed.find(e => e.slug === slug)
}
