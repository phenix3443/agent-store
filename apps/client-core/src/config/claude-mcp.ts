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
import { mkdir, mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import type { MCPItem } from '@as/types'
import { describeFailure, findBinary, runCli } from './cli-runner'
import { buildMcpServerSpec, toClaudeEntry, type McpServerConfig } from './mcp'
import { mcpEntriesEqual, mcpEntryDiff } from './mcp-compare'
import { readMcpTargets, writeMcpTargets, type McpTargetRecord } from './mcp-targets'
import { McpChangedOutsideError, McpConflictError, McpNotRestorableError, McpRestoreMismatchError } from './mcp-errors'
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

async function restorePrevious(ctx: ClaudeMcpContext, name: string, previous: unknown): Promise<void> {
  await addEntry(ctx, name, previous)
  const back = await readClaudeMcpEntry(ctx, name)
  if (!mcpEntriesEqual('claude', back, previous)) {
    throw new McpRestoreMismatchError('claude', name, previous, mcpEntryDiff('claude', previous, back))
  }
}

// ── enable / disable ─────────────────────────────────────────────────────────

async function saveRecord(ctx: ClaudeMcpContext, record: McpTargetRecord | undefined): Promise<void> {
  const targets = await readMcpTargets(ctx.itemDir)
  if (record) targets.claude = record
  else delete targets.claude
  await writeMcpTargets(ctx.itemDir, targets)
}

/**
 * Our entry is in place. Ownership comes only from targets.json: without a record a
 * same-name entry is the user's, even when it equals what we would write (§5.5).
 * With a record it must equal `written`; while `written` is null (an enable that stopped
 * between the tool write and the record update) it must equal what that enable writes.
 */
function isOurs(current: unknown, record: McpTargetRecord | undefined, desired: unknown): boolean {
  if (current === undefined || !record) return false
  if (record.written != null) return mcpEntriesEqual('claude', current, record.written)
  return desired !== undefined && mcpEntriesEqual('claude', current, desired)
}

export async function enableClaudeMcp(
  ctx: ClaudeMcpContext,
  name: string,
  entry: McpServerConfig,
  opts: { replace?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  const current = await readClaudeMcpEntry(ctx, name)
  const record = (await readMcpTargets(ctx.itemDir)).claude
  const previous = record?.previous ?? null

  if (isOurs(current, record, entry)) {
    if (opts.dryRun) return
    if (mcpEntriesEqual('claude', current, entry)) {
      if (record!.written == null) await saveRecord(ctx, { ...record!, written: current })
      return
    }
    // setConfig resync: still ours, so swap it for the new entry. targets.json keeps the
    // old entry until the new one is in, so a failure here can always be put back.
    await removeEntry(ctx, name)
    try {
      await addEntry(ctx, name, entry)
    } catch (e) {
      try {
        // A CLI can write the entry and still exit non-zero; clear that before putting the old one back.
        if ((await readClaudeMcpEntry(ctx, name)) !== undefined) await removeEntry(ctx, name)
        await restorePrevious(ctx, name, current)
      } catch (restoreError) {
        throw new Error(`The Claude MCP entry "${name}" was removed to apply the new config, the new entry could not be written (${(e as Error).message}) and the old one could not be put back (${(restoreError as Error).message}); it is still recorded in ${join(ctx.itemDir, 'targets.json')}, and \`as sync\` writes it again`)
      }
      throw e
    }
    await saveRecord(ctx, { ...record!, written: await readClaudeMcpEntry(ctx, name) })
    return
  } else if (current !== undefined) {
    if (!opts.replace) {
      throw record?.written != null
        ? new McpChangedOutsideError('claude', name, 'changed')
        : new McpConflictError('claude', name)
    }
    if (previous !== null && record?.written != null) {
      // Our takeover was edited outside Agent Store; replacing it again would lose that edit.
      // (written === null means a takeover was interrupted: reuse the saved previous.)
      throw new Error(`The Claude MCP entry "${name}" was changed outside Agent Store after it replaced your entry; run \`as disable ${name} --for claude --force\` to put your saved entry back first`)
    }
    let adopted = previous
    let cliVersion = record?.cliVersion
    if (adopted === null) {
      if (!ctx.cli) throw new McpNotRestorableError('claude', name, ['(the claude CLI is not installed; --replace needs it to check the restore)'])
      const lost = await trialRestore(ctx.cli, name, current)
      if (lost.length) throw new McpNotRestorableError('claude', name, lost)
      adopted = current
      cliVersion = await ctx.cli.version()
    }
    if (opts.dryRun) return
    // Record what we replace before touching the file, so a crash cannot lose it.
    await saveRecord(ctx, { name, written: null, previous: adopted, cliVersion })
    await removeEntry(ctx, name)
    try {
      await addEntry(ctx, name, entry)
    } catch (e) {
      await restorePrevious(ctx, name, adopted)
      await saveRecord(ctx, undefined)
      throw e
    }
    await saveRecord(ctx, { name, written: await readClaudeMcpEntry(ctx, name), previous: adopted, cliVersion })
    return
  }

  if (opts.dryRun) return
  // Claim the name before writing it, so an entry left by an interrupted run is provably ours.
  if (!record) await saveRecord(ctx, { name, written: null, previous: null })
  try {
    await addEntry(ctx, name, entry)
  } catch (e) {
    // Keep the claim if the entry got written anyway, so it is not mistaken for the user's.
    if (!record && (await readClaudeMcpEntry(ctx, name)) === undefined) await saveRecord(ctx, undefined)
    throw e
  }
  await saveRecord(ctx, { name, written: await readClaudeMcpEntry(ctx, name), previous, ...(record?.cliVersion ? { cliVersion: record.cliVersion } : {}) })
}

export async function disableClaudeMcp(
  ctx: ClaudeMcpContext,
  name: string,
  opts: { force?: boolean; expected?: McpServerConfig } = {}
): Promise<void> {
  const current = await readClaudeMcpEntry(ctx, name)
  const record = (await readMcpTargets(ctx.itemDir)).claude
  if (!record && current === undefined) return
  // A claim from an enable that stopped before writing anything: nothing to remove.
  if (current === undefined && record?.written == null && record?.previous == null) {
    await saveRecord(ctx, undefined)
    return
  }

  if (!isOurs(current, record, opts.expected) && !opts.force) {
    throw new McpChangedOutsideError('claude', name, current === undefined ? 'removed' : 'changed')
  }
  if (current !== undefined) await removeEntry(ctx, name)
  if (record?.previous != null) {
    try {
      await restorePrevious(ctx, name, record.previous)
    } catch (e) {
      await saveRecord(ctx, { ...record, written: null })
      throw e
    }
  }
  await saveRecord(ctx, undefined)
}

// ── Item-level entry point used by the engine ────────────────────────────────

export async function syncClaudeMcp(
  ctx: ClaudeMcpContext,
  slug: string,
  action: 'add' | 'remove',
  opts: { replace?: boolean; force?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  let config: Record<string, unknown> = {}
  try { config = JSON.parse(await readFile(join(ctx.itemDir, 'config.json'), 'utf-8')) } catch { /* not configured */ }
  const build = async () => {
    const manifest = JSON.parse(await readFile(join(ctx.itemDir, 'manifest.json'), 'utf-8')) as MCPItem
    return toClaudeEntry(buildMcpServerSpec(manifest, ctx.itemDir, config))
  }
  if (action === 'add') {
    await enableClaudeMcp(ctx, slug, await build(), opts)
    return
  }
  let expected: McpServerConfig | undefined
  try { expected = await build() } catch { /* no manifest or unconfigured: rely on the record */ }
  await disableClaudeMcp(ctx, slug, { force: opts.force, expected })
}
