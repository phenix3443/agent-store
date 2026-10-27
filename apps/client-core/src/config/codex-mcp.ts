// Codex MCP entries (`[mcp_servers.<name>]` in $CODEX_HOME/config.toml),
// written through `codex mcp add/remove` with Agent Store's own ownership
// rules (docs/global-skills-mcp.md §5.2, §5.5):
//   - preflight parses config.toml read-only; a file that does not parse aborts;
//   - a same-name table Agent Store did not write is a conflict unless
//     --replace, which only proceeds when the table holds nothing but keys the
//     CLI can express and a trial round-trip in a scratch CODEX_HOME gives it
//     back under the comparison rule;
//   - disable/uninstall only remove a table that still equals what we wrote,
//     then restore the replaced one with the CLI and check it.
// Without the codex binary the same rules apply to a text edit that only
// touches our table (comments elsewhere survive), and --replace is refused.
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { parse } from '@iarna/toml'
import type { MCPItem } from '@as/types'
import { describeFailure, findBinary, runCli } from './cli-runner'
import { buildMcpServerSpec, type McpServerSpec } from './mcp'
import { deepEqual, mcpEntriesEqual, mcpEntryDiff } from './mcp-compare'
import { disableMcpEntry, enableMcpEntry, type McpEntryStore } from './mcp-ownership'
import { atomicWriteFile, backupFile, ConfigParseError } from './safe-file'

/** A Codex MCP table as the CLI can write it. */
export type CodexMcpEntry =
  | { command: string; args?: string[]; env?: Record<string, string> }
  | { url: string; bearer_token_env_var?: string }

/** Where a Codex config lives; `home` pins HOME for a scratch config. */
export interface CodexLocation {
  codexHome: string
  home?: string
}

export interface CodexMcpCli {
  version(): Promise<string>
  add(at: CodexLocation, name: string, entry: CodexMcpEntry): Promise<void>
  remove(at: CodexLocation, name: string): Promise<void>
}

export interface CodexMcpContext extends CodexLocation {
  aasHome: string
  /** ~/.agents/mcps/<slug> */
  itemDir: string
  /** null: the codex binary is not installed. */
  cli: CodexMcpCli | null
}

export class CodexMcpUnsupportedError extends Error {
  constructor(slug: string, what: string) {
    super(`${slug} can't be enabled for Codex: ${what}`)
    this.name = 'CodexMcpUnsupportedError'
  }
}

const configPath = (at: CodexLocation) => join(at.codexHome, 'config.toml')

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Codex fields: stdio command/args/env, http url/bearer_token_env_var; no sse, no other headers. */
export function toCodexEntry(slug: string, spec: McpServerSpec): CodexMcpEntry {
  if (spec.transport === 'sse') throw new CodexMcpUnsupportedError(slug, 'Codex does not support SSE MCP servers')
  if (spec.transport !== 'stdio') {
    if (Object.keys(spec.headers).length) {
      throw new CodexMcpUnsupportedError(slug, `HTTP headers (${Object.keys(spec.headers).join(', ')}) other than a bearer token are not supported`)
    }
    return { url: spec.url, ...(spec.bearer ? { bearer_token_env_var: spec.bearer.env } : {}) }
  }
  return {
    command: spec.command,
    ...(spec.args.length ? { args: spec.args } : {}),
    ...(Object.keys(spec.env).length ? { env: spec.env } : {}),
  }
}

const RESTORABLE_KEYS = new Set(['command', 'args', 'env', 'url', 'bearer_token_env_var'])

/**
 * Keys of a raw table that `codex mcp add` cannot write back (§5.5 step 2).
 * Empty when the CLI can express every key.
 */
export function codexUnrestorableKeys(entry: unknown): string[] {
  if (!isPlainObject(entry)) return ['(entry)']
  const bad = Object.keys(entry).filter(k => !RESTORABLE_KEYS.has(k))
  const isStrings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === 'string')
  const isStringMap = (v: unknown) => isPlainObject(v) && Object.values(v).every(x => typeof x === 'string')
  if ('command' in entry && typeof entry['command'] !== 'string') bad.push('command')
  if ('args' in entry && !isStrings(entry['args'])) bad.push('args')
  if ('env' in entry && !isStringMap(entry['env'])) bad.push('env')
  if ('url' in entry && typeof entry['url'] !== 'string') bad.push('url')
  if ('bearer_token_env_var' in entry && typeof entry['bearer_token_env_var'] !== 'string') bad.push('bearer_token_env_var')
  if ('command' in entry === 'url' in entry) bad.push('command/url (exactly one is needed)')
  if ('command' in entry && 'bearer_token_env_var' in entry) bad.push('bearer_token_env_var')
  if ('url' in entry && ('args' in entry || 'env' in entry)) bad.push(...['args', 'env'].filter(k => k in entry))
  return [...new Set(bad)].sort()
}

/** argv for `codex mcp add` that writes exactly `entry`. */
export function codexAddArgs(name: string, entry: CodexMcpEntry): string[] {
  if ('url' in entry) {
    return ['mcp', 'add', name, '--url', entry.url,
      ...(entry.bearer_token_env_var ? ['--bearer-token-env-var', entry.bearer_token_env_var] : [])]
  }
  const env = Object.entries(entry.env ?? {}).flatMap(([k, v]) => ['--env', `${k}=${v}`])
  return ['mcp', 'add', name, ...env, '--', entry.command, ...(entry.args ?? [])]
}

function cliEnv(at: CodexLocation): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: at.codexHome }
  if (at.home) env['HOME'] = at.home
  return env
}

/** The installed `codex` CLI, or null. `AS_CODEX_BIN` overrides the lookup ('' = none). */
export function resolveCodexCli(env: NodeJS.ProcessEnv = process.env): CodexMcpCli | null {
  const bin = findBinary('codex', 'AS_CODEX_BIN', env)
  if (!bin) return null
  return {
    async version() {
      const r = await runCli(bin, ['--version'], { ...process.env })
      return r.code === 0 ? r.stdout.trim() : 'unknown'
    },
    async add(at, name, entry) {
      const r = await runCli(bin, codexAddArgs(name, entry), cliEnv(at))
      if (r.code !== 0) throw new Error(describeFailure(`codex mcp add ${name}`, r))
    },
    async remove(at, name) {
      const r = await runCli(bin, ['mcp', 'remove', name], cliEnv(at))
      if (r.code !== 0) throw new Error(describeFailure(`codex mcp remove ${name}`, r))
    },
  }
}

// ── File access ──────────────────────────────────────────────────────────────

async function readText(at: CodexLocation): Promise<string | undefined> {
  try {
    return await readFile(configPath(at), 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw e
  }
}

function parseConfig(path: string, text: string | undefined): Record<string, unknown> {
  if (text === undefined) return {}
  try {
    return JSON.parse(JSON.stringify(parse(text))) as Record<string, unknown>
  } catch (e) {
    throw new ConfigParseError(path, (e as Error).message.split('\n')[0])
  }
}

function parseServers(path: string, text: string | undefined): Record<string, unknown> {
  const servers = parseConfig(path, text)['mcp_servers']
  if (servers === undefined) return {}
  if (!isPlainObject(servers)) throw new ConfigParseError(path, 'mcp_servers is not a table')
  return servers
}

/** The raw `[mcp_servers.<name>]` table as JSON, read-only. */
export async function readCodexMcpEntry(at: CodexLocation, name: string): Promise<unknown> {
  const entry = parseServers(configPath(at), await readText(at))[name]
  return entry === undefined ? undefined : JSON.parse(JSON.stringify(entry))
}

const tomlString = (s: string) => JSON.stringify(s).replace(/\u007f/g, '\\u007f')

const tomlKey = (k: string) => /^[A-Za-z0-9_-]+$/.test(k) ? k : tomlString(k)

function tableText(name: string, entry: CodexMcpEntry): string {
  const lines = [`[mcp_servers.${tomlKey(name)}]`]
  if ('url' in entry) {
    lines.push(`url = ${tomlString(entry.url)}`)
    if (entry.bearer_token_env_var) lines.push(`bearer_token_env_var = ${tomlString(entry.bearer_token_env_var)}`)
  } else {
    lines.push(`command = ${tomlString(entry.command)}`)
    if (entry.args) lines.push(`args = [${entry.args.map(tomlString).join(', ')}]`)
    if (entry.env && Object.keys(entry.env).length) {
      lines.push('', `[mcp_servers.${tomlKey(name)}.env]`)
      for (const [k, v] of Object.entries(entry.env)) lines.push(`${tomlKey(k)} = ${tomlString(v)}`)
    }
  }
  return lines.join('\n') + '\n'
}

/**
 * Drops the `[mcp_servers.<name>]` table and its sub-tables, leaving every
 * other line alone. Comments right above the next header belong to that table
 * and are kept.
 */
function withoutTable(text: string, name: string): string {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const ours = new RegExp(`^\\s*\\[\\s*mcp_servers\\s*\\.\\s*("${esc}"|'${esc}'|${esc})\\s*(\\]|\\.)`)
  const header = /^\s*\[/
  const out: string[] = []
  let skipping = false
  let pending: string[] = []
  for (const line of text.split('\n')) {
    if (header.test(line)) {
      if (skipping && !ours.test(line)) {
        // Don't double the blank line that already separates the previous table.
        while (pending.length && !pending[0].trim() && (out.length === 0 || !out[out.length - 1].trim())) pending.shift()
        out.push(...pending)
      }
      pending = []
      skipping = ours.test(line)
    }
    if (!skipping) out.push(line)
    else if (/^\s*(#.*)?$/.test(line)) pending.push(line)
    else pending = []
  }
  if (skipping) out.push(...pending.filter(l => l.trim()))
  return out.join('\n')
}

/** The parsed config without our entry, for checking an edit touched nothing else. */
function others(config: Record<string, unknown>, name: string): Record<string, unknown> {
  const copy = { ...config }
  const servers = isPlainObject(copy['mcp_servers']) ? { ...copy['mcp_servers'] } : undefined
  if (servers) {
    delete servers[name]
    if (Object.keys(servers).length) copy['mcp_servers'] = servers
    else delete copy['mcp_servers']
  }
  return copy
}

/** Fallback when the binary is missing: parse-or-abort, text edit of our table only, check, back up, atomic write. */
async function editConfigFile(ctx: CodexMcpContext, name: string, entry: CodexMcpEntry | undefined): Promise<void> {
  const path = configPath(ctx)
  const before = await readText(ctx)
  const parsedBefore = parseConfig(path, before)
  parseServers(path, before)
  let text = withoutTable(before ?? '', name).replace(/\n*$/, '\n')
  if (text === '\n') text = ''
  if (entry) text += `${text ? '\n' : ''}${tableText(name, entry)}`
  const cantEdit = () => new Error(`${path}: the "${name}" MCP entry is written in a form Agent Store can't edit without the codex CLI (inline table, dotted keys or a multi-line string); nothing was changed`)
  let parsedAfter: Record<string, unknown>
  try { parsedAfter = parseConfig(path, text) } catch { throw cantEdit() }
  const after = isPlainObject(parsedAfter['mcp_servers']) ? parsedAfter['mcp_servers'][name] : undefined
  if (!(entry ? mcpEntriesEqual('codex', after, entry) : after === undefined) ||
      !deepEqual(others(parsedAfter, name), others(parsedBefore, name))) {
    throw cantEdit()
  }
  await backupFile(ctx.aasHome, path)
  await atomicWriteFile(path, text, 0o600, before === undefined)
}

async function addEntry(ctx: CodexMcpContext, name: string, entry: CodexMcpEntry): Promise<void> {
  if (!ctx.cli) return editConfigFile(ctx, name, entry)
  // codex refuses a CODEX_HOME that does not exist yet.
  await mkdir(ctx.codexHome, { recursive: true })
  // Env values may be secrets: a config.toml we create starts out private.
  try { await stat(configPath(ctx)) } catch { await writeFile(configPath(ctx), '', { mode: 0o600, flag: 'wx' }).catch(() => undefined) }
  await ctx.cli.add(ctx, name, entry)
}

async function removeEntry(ctx: CodexMcpContext, name: string): Promise<void> {
  if (ctx.cli) await ctx.cli.remove(ctx, name)
  else await editConfigFile(ctx, name, undefined)
}

// ── --replace restorability ──────────────────────────────────────────────────

/** Keys the CLI would not restore exactly: the key check, then a trial in a scratch CODEX_HOME. */
export async function trialRestore(cli: CodexMcpCli, name: string, previous: unknown): Promise<string[]> {
  const unsupported = codexUnrestorableKeys(previous)
  if (unsupported.length) return unsupported
  const scratch = await mkdtemp(join(tmpdir(), 'as-codex-trial-'))
  const at: CodexLocation = { codexHome: join(scratch, 'codex'), home: join(scratch, 'home') }
  try {
    await mkdir(at.codexHome, { recursive: true })
    await mkdir(at.home!, { recursive: true })
    try {
      await cli.add(at, name, previous as CodexMcpEntry)
    } catch (e) {
      return [`(codex mcp add failed: ${(e as Error).message})`]
    }
    return mcpEntryDiff('codex', previous, await readCodexMcpEntry(at, name))
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

// ── enable / disable (rules in mcp-ownership.ts) ─────────────────────────────

function entryStore(ctx: CodexMcpContext): McpEntryStore {
  const cli = ctx.cli
  return {
    tool: 'codex',
    itemDir: ctx.itemDir,
    read: name => readCodexMcpEntry(ctx, name),
    add: (name, entry) => addEntry(ctx, name, entry as CodexMcpEntry),
    remove: name => removeEntry(ctx, name),
    cli: cli && { version: () => cli.version(), trialRestore: (name, previous) => trialRestore(cli, name, previous) },
  }
}

export async function enableCodexMcp(
  ctx: CodexMcpContext,
  name: string,
  entry: CodexMcpEntry,
  opts: { replace?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  await enableMcpEntry(entryStore(ctx), name, entry, opts)
}

export async function disableCodexMcp(
  ctx: CodexMcpContext,
  name: string,
  opts: { force?: boolean; expected?: CodexMcpEntry } = {}
): Promise<void> {
  await disableMcpEntry(entryStore(ctx), name, opts)
}

// ── Item-level entry point used by the engine ────────────────────────────────

export async function syncCodexMcp(
  ctx: CodexMcpContext,
  slug: string,
  action: 'add' | 'remove',
  opts: { replace?: boolean; force?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  let config: Record<string, unknown> = {}
  try { config = JSON.parse(await readFile(join(ctx.itemDir, 'config.json'), 'utf-8')) } catch { /* not configured */ }
  const build = async () => {
    const manifest = JSON.parse(await readFile(join(ctx.itemDir, 'manifest.json'), 'utf-8')) as MCPItem
    return toCodexEntry(slug, buildMcpServerSpec(manifest, ctx.itemDir, config))
  }
  if (action === 'add') {
    await enableCodexMcp(ctx, slug, await build(), opts)
    return
  }
  let expected: CodexMcpEntry | undefined
  try { expected = await build() } catch { /* no manifest or unconfigured: rely on the record */ }
  await disableCodexMcp(ctx, slug, { force: opts.force, expected })
}
