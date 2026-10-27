// Claude Code user-scope MCP entries (`mcpServers` in .claude.json), written
// through `claude mcp add-json/remove --scope user` with Agent Store's own
// ownership rules (docs/global-skills-mcp.md §5.1, §5.5):
//   - preflight reads the file first; a file that does not parse aborts;
//   - a same-name entry Agent Store did not write is a conflict unless
//     --replace, which only proceeds after a trial round-trip in a scratch
//     config shows the CLI can put the user's entry back exactly;
//   - disable/uninstall only remove an entry that still equals what we wrote,
//     then restore the replaced entry and check it under the comparison rule.
// Without the claude binary the same rules apply to a safe file edit, and
// --replace is refused (the trial needs the CLI).
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { describeFailure, findBinary, runCli } from './cli-runner'
import { toClaudeEntry, type McpServerConfig } from './mcp'
import { mcpEntryDiff } from './mcp-compare'
import { disableMcpEntry, enableMcpEntry, syncMcpEntry, type McpEntryStore } from './mcp-ownership'
import { atomicWriteFile, backupFile, ConfigParseError, readJsonObject } from './safe-file'

/** Where a Claude config lives; `home` pins HOME for a scratch config. */
export interface ClaudeLocation {
  claudeConfigDir: string
  claudeJsonPath: string
  home?: string
}

export interface ClaudeMcpCli {
  version(): Promise<string>
  addJson(at: ClaudeLocation, name: string, entry: unknown): Promise<void>
  remove(at: ClaudeLocation, name: string): Promise<void>
}

export interface ClaudeMcpContext extends ClaudeLocation {
  aasHome: string
  /** ~/.agents/mcps/<slug> */
  itemDir: string
  /** null: the claude binary is not installed. */
  cli: ClaudeMcpCli | null
}

function cliEnv(at: ClaudeLocation): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (at.claudeJsonPath === join(at.claudeConfigDir, '.claude.json')) {
    env['CLAUDE_CONFIG_DIR'] = at.claudeConfigDir
  } else {
    delete env['CLAUDE_CONFIG_DIR']
    env['HOME'] = dirname(at.claudeJsonPath)
  }
  if (at.home) env['HOME'] = at.home
  return env
}

/** The installed `claude` CLI, or null. `AS_CLAUDE_BIN` overrides the lookup ('' = none). */
export function resolveClaudeCli(env: NodeJS.ProcessEnv = process.env): ClaudeMcpCli | null {
  const bin = findBinary('claude', 'AS_CLAUDE_BIN', env)
  if (!bin) return null
  return {
    async version() {
      const r = await runCli(bin, ['--version'], cliEnv({ claudeConfigDir: '', claudeJsonPath: '' }))
      return r.code === 0 ? r.stdout.trim() : 'unknown'
    },
    async addJson(at, name, entry) {
      const r = await runCli(bin, ['mcp', 'add-json', '--scope', 'user', name, JSON.stringify(entry)], cliEnv(at))
      if (r.code !== 0) throw new Error(describeFailure(`claude mcp add-json ${name}`, r))
    },
    async remove(at, name) {
      const r = await runCli(bin, ['mcp', 'remove', '--scope', 'user', name], cliEnv(at))
      if (r.code !== 0) throw new Error(describeFailure(`claude mcp remove ${name}`, r))
    },
  }
}

// ── File access ──────────────────────────────────────────────────────────────

async function readServers(at: ClaudeLocation): Promise<Record<string, unknown>> {
  const json = await readJsonObject(at.claudeJsonPath)
  const servers = json?.['mcpServers']
  if (servers === undefined) return {}
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) {
    throw new ConfigParseError(at.claudeJsonPath, 'mcpServers is not an object')
  }
  return servers as Record<string, unknown>
}

export async function readClaudeMcpEntry(at: ClaudeLocation, name: string): Promise<unknown> {
  return (await readServers(at))[name]
}

/** Fallback when the binary is missing: parse-or-abort, back up, atomic write, 0600. */
async function editServersFile(ctx: ClaudeMcpContext, edit: (servers: Record<string, unknown>) => void): Promise<void> {
  const json = (await readJsonObject(ctx.claudeJsonPath)) ?? {}
  const servers = { ...(await readServers(ctx)) }
  edit(servers)
  if (Object.keys(servers).length) json['mcpServers'] = servers
  else delete json['mcpServers']
  await backupFile(ctx.aasHome, ctx.claudeJsonPath)
  await atomicWriteFile(ctx.claudeJsonPath, JSON.stringify(json, null, 2), 0o600, true)
}

async function addEntry(ctx: ClaudeMcpContext, name: string, entry: unknown): Promise<void> {
  if (ctx.cli) await ctx.cli.addJson(ctx, name, entry)
  else await editServersFile(ctx, s => { s[name] = entry })
}

async function removeEntry(ctx: ClaudeMcpContext, name: string): Promise<void> {
  if (ctx.cli) await ctx.cli.remove(ctx, name)
  else await editServersFile(ctx, s => { delete s[name] })
}

// ── --replace restorability ──────────────────────────────────────────────────

/** Keys the CLI would not restore exactly, found by running the restore in a scratch config. */
export async function trialRestore(cli: ClaudeMcpCli, name: string, previous: unknown): Promise<string[]> {
  const scratch = await mkdtemp(join(tmpdir(), 'as-claude-trial-'))
  const at: ClaudeLocation = { claudeConfigDir: join(scratch, 'claude'), claudeJsonPath: join(scratch, 'claude', '.claude.json'), home: join(scratch, 'home') }
  try {
    await mkdir(at.claudeConfigDir, { recursive: true })
    await mkdir(at.home!, { recursive: true })
    try {
      await cli.addJson(at, name, previous)
    } catch (e) {
      return [`(claude mcp add-json failed: ${(e as Error).message})`]
    }
    return mcpEntryDiff('claude', previous, await readClaudeMcpEntry(at, name))
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

// ── enable / disable (rules in mcp-ownership.ts) ─────────────────────────────

function entryStore(ctx: ClaudeMcpContext): McpEntryStore {
  const cli = ctx.cli
  return {
    tool: 'claude',
    itemDir: ctx.itemDir,
    read: name => readClaudeMcpEntry(ctx, name),
    add: (name, entry) => addEntry(ctx, name, entry),
    remove: name => removeEntry(ctx, name),
    cli: cli && { version: () => cli.version(), trialRestore: (name, previous) => trialRestore(cli, name, previous) },
  }
}

export async function enableClaudeMcp(
  ctx: ClaudeMcpContext,
  name: string,
  entry: McpServerConfig,
  opts: { replace?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  await enableMcpEntry(entryStore(ctx), name, entry, opts)
}

export async function disableClaudeMcp(
  ctx: ClaudeMcpContext,
  name: string,
  opts: { force?: boolean; expected?: McpServerConfig } = {}
): Promise<void> {
  await disableMcpEntry(entryStore(ctx), name, opts)
}

// ── Item-level entry point used by the engine ────────────────────────────────

export async function syncClaudeMcp(
  ctx: ClaudeMcpContext,
  slug: string,
  action: 'add' | 'remove',
  opts: { replace?: boolean; force?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  await syncMcpEntry(entryStore(ctx), slug, action, spec => toClaudeEntry(spec), opts)
}
