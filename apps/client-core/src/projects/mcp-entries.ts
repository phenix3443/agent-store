// MCP entries for a project's committed files. Every value the user would type
// becomes a reference to an environment variable, so no key is ever written into
// the repository:
//   Claude Code (.mcp.json):       "${NAME}" anywhere in command, args, env, url, headers;
//   Codex (.codex/config.toml):    env_vars (stdio), bearer_token_env_var and env_http_headers (http).
// Codex has no reference syntax inside args or url, so an item that needs one there
// is not installed for Codex.
import type { MCPItem } from '@as/types'
import { buildMcpServerSpec, configEnvName, toClaudeEntry, type McpServerSpec } from '../config/mcp'
import { assertEnvName } from './store'

export class ProjectMcpUnsupportedError extends Error {
  constructor(
    readonly slug: string,
    message: string,
    readonly reason: 'not-portable' | 'codex-reference' | 'sse' | 'invalid-env-name',
    readonly tool?: 'claude' | 'codex',
  ) {
    super(message)
    this.name = 'ProjectMcpUnsupportedError'
  }
}

// Survives encodeURIComponent, so a reference inside a templated URL is found again.
const ref = (name: string) => `ASREF__${name}__FERSA`
const REF = /ASREF__([A-Za-z_][A-Za-z0-9_]*?)__FERSA/g
const EXACT_REF = /^ASREF__([A-Za-z_][A-Za-z0-9_]*?)__FERSA$/

interface Prop { 'x-env'?: string; 'x-secret'?: boolean; 'x-bearer'?: boolean; default?: unknown }

export interface ProjectMcpSpec {
  spec: McpServerSpec
  /** Variables the entry references, in schema order. */
  env: string[]
}

/**
 * The server with references in place of user values. A public schema default is
 * written as is; a required value without one becomes a reference; an optional value
 * without one is left out, because Claude Code would warn about the unset variable.
 */
export function projectMcpSpec(manifest: MCPItem): ProjectMcpSpec {
  const slug = manifest.slug
  if (manifest.installHook?.steps?.some(s => s.type === 'file') || ((manifest.transport === 'stdio' && (manifest.command ?? manifest.serverCommand)) || '').startsWith('.')) {
    throw new ProjectMcpUnsupportedError(slug, `${slug} runs files Agent Store downloads into its own directory, which teammates do not have; it can only be installed for your user`, 'not-portable')
  }
  const schema = (manifest.configSchema ?? {}) as { properties?: Record<string, Prop>; required?: string[] }
  const required = new Set(schema.required ?? [])
  const config: Record<string, unknown> = {}
  const env: string[] = []
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const secret = prop['x-secret'] === true || prop['x-bearer'] === true
    if (!secret && prop.default !== undefined && prop.default !== null && prop.default !== '') {
      config[key] = prop.default
      continue
    }
    if (!required.has(key)) continue
    const name = configEnvName(key, prop)
    try { assertEnvName(name) } catch (e) { throw new ProjectMcpUnsupportedError(slug, `${slug}: ${(e as Error).message}`, 'invalid-env-name') }
    config[key] = ref(name)
    if (!env.includes(name)) env.push(name)
  }
  return { spec: buildMcpServerSpec(manifest, '/', config), env }
}

function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value)
  if (Array.isArray(value)) return value.map(v => mapStrings(v, fn))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]))
  return value
}

export function claudeProjectEntry(spec: McpServerSpec): Record<string, unknown> {
  return mapStrings(toClaudeEntry(spec), s => s.replace(REF, (_m, name: string) => `\${${name}}`)) as Record<string, unknown>
}

export function codexProjectEntry(slug: string, spec: McpServerSpec): Record<string, unknown> {
  const unsupported = (where: string) =>
    new ProjectMcpUnsupportedError(slug, `${slug} needs a value inside its ${where}, and Codex can only read values from the environment as whole variables; it was installed for Claude Code only`, 'codex-reference', 'codex')
  const hasRef = (s: string) => new RegExp(REF.source).test(s)
  if (spec.transport === 'sse') throw new ProjectMcpUnsupportedError(slug, `${slug} uses SSE, which Codex does not support`, 'sse', 'codex')
  if (spec.transport === 'stdio') {
    if (hasRef(spec.command) || spec.args.some(hasRef)) throw unsupported('command line')
    const env: Record<string, string> = {}
    const envVars: string[] = []
    for (const [k, v] of Object.entries(spec.env)) {
      const exact = v.match(EXACT_REF)
      if (exact && exact[1] === k) envVars.push(k)
      else if (hasRef(v)) throw unsupported(`environment variable ${k}`)
      else env[k] = v
    }
    return {
      command: spec.command,
      ...(spec.args.length ? { args: spec.args } : {}),
      ...(envVars.length ? { env_vars: envVars } : {}),
      ...(Object.keys(env).length ? { env } : {}),
    }
  }
  if (hasRef(spec.url)) throw unsupported('URL')
  const headers: Record<string, string> = {}
  const envHeaders: Record<string, string> = {}
  for (const [k, v] of Object.entries(spec.headers)) {
    const exact = v.match(EXACT_REF)
    if (exact) envHeaders[k] = exact[1]
    else if (hasRef(v)) throw unsupported(`header ${k}`)
    else headers[k] = v
  }
  return {
    url: spec.url,
    ...(spec.bearer ? { bearer_token_env_var: spec.bearer.env } : {}),
    ...(Object.keys(headers).length ? { http_headers: headers } : {}),
    ...(Object.keys(envHeaders).length ? { env_http_headers: envHeaders } : {}),
  }
}

export interface EnvRef { name: string; required: boolean }

const CLAUDE_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)(:-[^}]*)?\}/g

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach(v => collectStrings(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach(v => collectStrings(v, out))
}

function addRef(out: EnvRef[], name: string, required: boolean): void {
  const prev = out.find(r => r.name === name)
  if (prev) prev.required ||= required
  else out.push({ name, required })
}

/** `${NAME}` and `${NAME:-default}` in any string of a Claude Code entry. */
export function claudeEnvRefs(entry: unknown): EnvRef[] {
  const strings: string[] = []
  collectStrings(entry, strings)
  const out: EnvRef[] = []
  for (const s of strings) for (const m of s.matchAll(CLAUDE_REF)) addRef(out, m[1], m[2] === undefined)
  return out
}

/** Variables a Codex entry reads from the environment. */
export function codexEnvRefs(entry: unknown): EnvRef[] {
  const out: EnvRef[] = []
  if (!entry || typeof entry !== 'object') return out
  const e = entry as Record<string, unknown>
  if (Array.isArray(e['env_vars'])) {
    for (const v of e['env_vars']) {
      const name = typeof v === 'string' ? v : (v as { name?: unknown } | null)?.name
      const source = typeof v === 'object' && v ? (v as { source?: unknown }).source : undefined
      if (typeof name === 'string' && source !== 'remote') addRef(out, name, true)
    }
  }
  if (typeof e['bearer_token_env_var'] === 'string') addRef(out, e['bearer_token_env_var'], true)
  if (e['env_http_headers'] && typeof e['env_http_headers'] === 'object') {
    for (const v of Object.values(e['env_http_headers'] as Record<string, unknown>)) if (typeof v === 'string') addRef(out, v, true)
  }
  return out
}
