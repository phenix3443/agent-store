import { resolve } from 'path'
import type { MCPItem } from '@as/types'

export interface StdioMcpServerConfig {
  type: 'stdio'
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
}

export interface RemoteMcpServerConfig {
  type: 'http' | 'sse'
  url: string
  headers?: Record<string, string>
}

export type McpServerConfig = StdioMcpServerConfig | RemoteMcpServerConfig

/**
 * What an MCP item needs at runtime, before it is written in either tool's
 * format. Config values are already bound (env, url placeholders, bearer).
 */
export type McpServerSpec =
  | { transport: 'stdio'; command: string; args: string[]; env: Record<string, string> }
  | {
      transport: 'http' | 'sse'
      url: string
      headers: Record<string, string>
      /** Token from an `x-bearer` config value, and the env var Codex reads it from. */
      bearer?: { env: string; value: string }
    }

export class McpConfigMissingError extends Error {
  constructor(readonly slug: string, readonly missing: string[]) {
    super(`${slug} needs configuration before it can be enabled (missing: ${missing.join(', ')}); run \`aas config ${slug}\``)
    this.name = 'McpConfigMissingError'
  }
}

// ── serverCommand → argv ─────────────────────────────────────────────────────

const OPERATOR_CHARS = new Set(['|', '&', ';', '<', '>'])

/**
 * POSIX shell-word splitting without any expansion: single quotes are literal,
 * double quotes allow \" \\ \$ \` escapes, a backslash outside quotes escapes
 * the next character. Unbalanced quotes, unquoted shell operators, `$(` and
 * backticks are rejected rather than guessed at.
 */
export function splitCommandLine(line: string): string[] {
  const words: string[] = []
  let word = ''
  let inWord = false
  let i = 0
  const fail = (why: string): never => { throw new Error(`Cannot parse serverCommand (${why}): ${line}`) }

  while (i < line.length) {
    const c = line[i]
    if (c === ' ' || c === '\t' || c === '\n') {
      if (inWord) { words.push(word); word = ''; inWord = false }
      i++
    } else if (c === "'") {
      const end = line.indexOf("'", i + 1)
      if (end === -1) fail('unbalanced single quote')
      word += line.slice(i + 1, end)
      inWord = true
      i = end + 1
    } else if (c === '"') {
      i++
      inWord = true
      for (;;) {
        if (i >= line.length) fail('unbalanced double quote')
        const d = line[i]
        if (d === '"') { i++; break }
        if (d === '`' || (d === '$' && line[i + 1] === '(')) fail('command substitution')
        if (d === '\\' && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) { word += line[i + 1]; i += 2; continue }
        word += d
        i++
      }
    } else if (c === '\\') {
      if (i + 1 >= line.length) fail('trailing backslash')
      word += line[i + 1]
      inWord = true
      i += 2
    } else if (OPERATOR_CHARS.has(c)) {
      fail(`shell operator ${c}`)
    } else if (c === '`' || (c === '$' && line[i + 1] === '(')) {
      fail('command substitution')
    } else {
      word += c
      inWord = true
      i++
    }
  }
  if (inWord) words.push(word)
  return words
}

function resolveIfRelative(value: string, baseDir: string): string {
  return value.startsWith('.') ? resolve(baseDir, value) : value
}

// ── config → env / url / bearer ──────────────────────────────────────────────

interface ConfigProperty { 'x-env'?: string; 'x-bearer'?: boolean; 'x-template'?: boolean; default?: unknown }

const upperSnake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g

function bindConfig(manifest: MCPItem, config: Record<string, unknown>) {
  const schema = (manifest.configSchema ?? {}) as { properties?: Record<string, ConfigProperty>; required?: string[] }
  const properties = schema.properties ?? {}
  // Items built from the catalog fall back to the schema default; older items only use what the user set.
  const templated = manifest.templated === true
  const value = (key: string): string | undefined => {
    let v = config[key]
    if ((v === undefined || v === null || v === '') && templated) v = properties[key]?.default
    if (v === undefined || v === null || v === '') return undefined
    const s = String(v)
    if (/[\r\n]/.test(s)) throw new Error(`Config value ${key} for ${manifest.slug} contains a newline`)
    return s
  }
  const missing = (schema.required ?? []).filter(key => value(key) === undefined)
  if (missing.length) throw new McpConfigMissingError(manifest.slug, missing)

  const env: Record<string, string> = {}
  const placeholders: Record<string, string> = {}
  let bearer: { env: string; value: string } | undefined
  for (const [key, prop] of Object.entries(properties)) {
    const v = value(key)
    if (v === undefined) continue
    const envName = prop['x-env'] ?? upperSnake(key)
    placeholders[key] = v
    // The user may paste the whole header value; the scheme is added back when it is written.
    if (prop['x-bearer']) bearer = { env: envName, value: v.replace(/^Bearer\s+/i, '') }
    else if (!prop['x-template']) env[envName] = v
  }
  return { env, placeholders, bearer, templated }
}

/** `template` with every `{key}` filled; undefined when one has no value. */
function fill(template: string, placeholders: Record<string, string>): string | undefined {
  let complete = true
  const out = template.replace(PLACEHOLDER, (_whole, key: string) => {
    if (key in placeholders) return placeholders[key]
    complete = false
    return ''
  })
  return complete ? out : undefined
}

/** For templated items: required values are already checked, so an empty optional value drops its entry. */
function fillMap(map: Record<string, string>, placeholders: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(map)) {
    const filled = fill(v, placeholders)
    if (filled !== undefined) out[k] = filled
  }
  return out
}

export function buildMcpServerSpec(manifest: MCPItem, itemDir: string, config: Record<string, unknown>): McpServerSpec {
  const bound = bindConfig(manifest, config)
  switch (manifest.transport) {
    case 'http':
    case 'sse': {
      if (!manifest.url) throw new Error(`Missing MCP url for ${manifest.slug}`)
      const url = manifest.url.replace(PLACEHOLDER, (whole, key: string) => {
        if (!(key in bound.placeholders)) throw new McpConfigMissingError(manifest.slug, [key])
        return encodeURIComponent(bound.placeholders[key])
      })
      const headers = bound.templated ? fillMap(manifest.headers ?? {}, bound.placeholders) : { ...(manifest.headers ?? {}) }
      return {
        transport: manifest.transport,
        url,
        headers,
        ...(bound.bearer ? { bearer: bound.bearer } : {}),
      }
    }
    case 'stdio': {
      let argv: string[]
      if (typeof manifest.command === 'string' && manifest.command) {
        argv = [manifest.command, ...(manifest.args ?? [])]
      } else {
        if (!manifest.serverCommand) throw new Error(`Missing MCP serverCommand for ${manifest.slug}`)
        argv = splitCommandLine(manifest.serverCommand)
      }
      if (!argv[0]) throw new Error(`Empty MCP command for ${manifest.slug}`)
      if (bound.templated) {
        argv = argv.map(arg => {
          const filled = fill(arg, bound.placeholders)
          if (filled === undefined) throw new McpConfigMissingError(manifest.slug, [...arg.matchAll(PLACEHOLDER)].map(m => m[1]).filter(k => !(k in bound.placeholders)))
          return filled
        })
      }
      const fixed = manifest.env ?? {}
      const env = { ...(bound.templated ? fillMap(fixed, bound.placeholders) : fixed), ...bound.env }
      return { transport: 'stdio', command: resolveIfRelative(argv[0], itemDir), args: argv.slice(1), env }
    }
  }
}

/** Claude Code `mcpServers` entry: stdio {type,command,args,env}; http/sse {type,url,headers}. */
export function toClaudeEntry(spec: McpServerSpec): McpServerConfig {
  if (spec.transport === 'stdio') {
    return {
      type: 'stdio',
      command: spec.command,
      args: spec.args,
      ...(Object.keys(spec.env).length ? { env: spec.env } : {}),
    }
  }
  const headers = { ...spec.headers, ...(spec.bearer ? { Authorization: `Bearer ${spec.bearer.value}` } : {}) }
  return { type: spec.transport, url: spec.url, ...(Object.keys(headers).length ? { headers } : {}) }
}
