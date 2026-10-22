import { afterEach, beforeEach, expect, test } from 'bun:test'
import { createHash } from 'crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  disableClaudeMcp, enableClaudeMcp, readClaudeMcpEntry, trialRestore,
  type ClaudeLocation, type ClaudeMcpCli, type ClaudeMcpContext,
} from '../claude-mcp'
import { McpChangedOutsideError, McpConflictError, McpNotRestorableError, McpRestoreMismatchError } from '../mcp-errors'
import { ConfigParseError } from '../safe-file'
import { readMcpTargets } from '../mcp-targets'

// Mimics what `claude mcp add-json --scope user` 2.1.80 stores (§1.1-6): only
// its schema keys survive, http entries lose `env`, and a missing `args` on a
// stdio entry becomes [].
const SCHEMA_KEYS = ['type', 'command', 'args', 'env', 'url', 'headers', 'headersHelper', 'oauth']

async function fileServers(at: ClaudeLocation): Promise<Record<string, unknown>> {
  try { return JSON.parse(await readFile(at.claudeJsonPath, 'utf-8')).mcpServers ?? {} } catch { return {} }
}

async function writeServers(at: ClaudeLocation, servers: Record<string, unknown>) {
  let json: Record<string, unknown> = {}
  try { json = JSON.parse(await readFile(at.claudeJsonPath, 'utf-8')) } catch { /* new */ }
  json['mcpServers'] = servers
  await mkdir(at.claudeConfigDir, { recursive: true })
  await writeFile(at.claudeJsonPath, JSON.stringify(json, null, 2))
}

function fakeCli(calls: string[] = [], opts: { mangleRestore?: boolean } = {}): ClaudeMcpCli {
  return {
    async version() { return '2.1.80 (fake)' },
    async addJson(at, name, entry) {
      calls.push(`add ${name}`)
      const servers = await fileServers(at)
      if (name in servers) throw new Error(`MCP server ${name} already exists in user config`)
      const e = { ...(entry as Record<string, unknown>) }
      for (const k of Object.keys(e)) if (!SCHEMA_KEYS.includes(k)) delete e[k]
      const isHttp = e['type'] === 'http' || e['type'] === 'sse'
      if (isHttp) delete e['env']
      else if (e['args'] === undefined) e['args'] = []
      if (opts.mangleRestore && at.home === undefined && e['command'] === 'node' && !(e['args'] as string[]).length) e['args'] = ['mangled']
      servers[name] = e
      await writeServers(at, servers)
    },
    async remove(at, name) {
      calls.push(`remove ${name}`)
      const servers = await fileServers(at)
      if (!(name in servers)) throw new Error(`No user-scoped MCP server found with name: ${name}`)
      delete servers[name]
      await writeServers(at, servers)
    },
  }
}

let root: string
let ctx: ClaudeMcpContext
const OURS = { type: 'stdio' as const, command: 'node', args: ['/probe/as-probe-mcp.mjs'] }
const OTHER = { type: 'stdio', command: 'node', args: ['-e', '0'] }

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'as-claude-mcp-'))
  const claudeConfigDir = join(root, 'claude')
  ctx = {
    aasHome: join(root, 'agents'),
    claudeConfigDir,
    claudeJsonPath: join(claudeConfigDir, '.claude.json'),
    itemDir: join(root, 'agents', 'mcps', 'probe'),
    cli: fakeCli(),
  }
  await mkdir(ctx.itemDir, { recursive: true })
})

afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const sha = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex')

test('absent → added and recorded as written (read back)', async () => {
  await writeServers(ctx, { other: OTHER })
  await enableClaudeMcp(ctx, 'probe', OURS)
  expect(await readClaudeMcpEntry(ctx, 'probe')).toEqual(OURS)
  expect((await readMcpTargets(ctx.itemDir)).claude).toEqual({ name: 'probe', written: OURS, previous: null })
  expect(await readClaudeMcpEntry(ctx, 'other')).toEqual(OTHER)
})

test('equal to what we wrote → no-op', async () => {
  const calls: string[] = []
  ctx.cli = fakeCli(calls)
  await enableClaudeMcp(ctx, 'probe', OURS)
  await enableClaudeMcp(ctx, 'probe', OURS)
  expect(calls).toEqual(['add probe'])
})

test('same-name user entry → conflict, file byte-identical', async () => {
  await writeServers(ctx, { other: OTHER, probe: { command: 'node', args: ['users.js'] } })
  const before = await sha(ctx.claudeJsonPath)
  await expect(enableClaudeMcp(ctx, 'probe', OURS)).rejects.toBeInstanceOf(McpConflictError)
  expect(await sha(ctx.claudeJsonPath)).toBe(before)
})

test('a broken .claude.json aborts before the CLI runs', async () => {
  const calls: string[] = []
  ctx.cli = fakeCli(calls)
  await mkdir(ctx.claudeConfigDir, { recursive: true })
  await writeFile(ctx.claudeJsonPath, '{"mcpServers": {broken')
  const before = await sha(ctx.claudeJsonPath)
  await expect(enableClaudeMcp(ctx, 'probe', OURS)).rejects.toBeInstanceOf(ConfigParseError)
  await expect(disableClaudeMcp(ctx, 'probe')).rejects.toBeInstanceOf(ConfigParseError)
  expect(calls).toEqual([])
  expect(await sha(ctx.claudeJsonPath)).toBe(before)
})

for (const [label, seed, lost] of [
  ['review case', { type: 'http', url: 'https://example.invalid/mcp', headers: { 'X-Test': 'preserve-me' }, unknown: 'keep' }, ['unknown']],
  ['http + env + unknown', { type: 'http', url: 'https://example.invalid/mcp', env: { K: 'v' }, unknown: 'x' }, ['env', 'unknown']],
  ['timeout', { type: 'stdio', command: 'node', args: [], timeout: 5 }, ['timeout']],
] as const) {
  test(`--replace refuses a not-restorable entry (${label}) and names ${lost.join(', ')}`, async () => {
    await writeServers(ctx, { other: OTHER, probe: seed })
    const before = await sha(ctx.claudeJsonPath)
    const err = await enableClaudeMcp(ctx, 'probe', OURS, { replace: true }).catch(e => e)
    expect(err).toBeInstanceOf(McpNotRestorableError)
    expect((err as McpNotRestorableError).keys).toEqual([...lost])
    expect(await sha(ctx.claudeJsonPath)).toBe(before)
    expect((await readMcpTargets(ctx.itemDir)).claude).toBeUndefined()
  })
}

for (const [label, seed] of [
  ['stdio with spaced arg and env', { type: 'stdio', command: 'node', args: ['/tmp/a b/s.js', '--flag'], env: { K: 'v 1' } }],
  ['http with headers', { type: 'http', url: 'https://example.invalid/mcp', headers: { 'X-Test': 'preserve-me' } }],
  ['command only', { command: 'node' }],
] as const) {
  for (const how of ['disable', 'force-uninstall'] as const) {
    test(`--replace takes over a restorable entry (${label}) and ${how} restores it`, async () => {
      await writeServers(ctx, { other: OTHER, probe: seed })
      await enableClaudeMcp(ctx, 'probe', OURS, { replace: true })
      expect(await readClaudeMcpEntry(ctx, 'probe')).toEqual(OURS)
      const rec = (await readMcpTargets(ctx.itemDir)).claude
      expect(rec?.previous).toEqual(seed)
      expect(rec?.cliVersion).toBe('2.1.80 (fake)')
      await disableClaudeMcp(ctx, 'probe', how === 'force-uninstall' ? { force: true } : {})
      const restored = await readClaudeMcpEntry(ctx, 'probe')
      // command-only comes back with args: [] (equal under the comparison rule).
      expect(restored).toEqual(label === 'command only' ? { command: 'node', args: [] } : seed)
      expect(await readClaudeMcpEntry(ctx, 'other')).toEqual(OTHER)
      expect((await readMcpTargets(ctx.itemDir)).claude).toBeUndefined()
    })
  }
}

test('trial runs in a scratch config and leaves nothing behind', async () => {
  const before = await readdir(tmpdir())
  expect(await trialRestore(fakeCli(), 'p', { type: 'http', url: 'u', unknown: 1 })).toEqual(['unknown'])
  expect((await readdir(tmpdir())).filter(n => n.startsWith('as-claude-trial-') && !before.includes(n))).toEqual([])
})

test('--replace without the claude binary is refused, file untouched', async () => {
  ctx.cli = null
  await writeServers(ctx, { probe: { command: 'node' } })
  const before = await sha(ctx.claudeJsonPath)
  await expect(enableClaudeMcp(ctx, 'probe', OURS, { replace: true })).rejects.toBeInstanceOf(McpNotRestorableError)
  expect(await sha(ctx.claudeJsonPath)).toBe(before)
})

test('external edit → disable refuses and keeps it; --force removes it', async () => {
  await enableClaudeMcp(ctx, 'probe', OURS)
  const edited = { ...OURS, env: { EDITED: '1' } }
  await writeServers(ctx, { probe: edited })
  await expect(disableClaudeMcp(ctx, 'probe')).rejects.toBeInstanceOf(McpChangedOutsideError)
  expect(await readClaudeMcpEntry(ctx, 'probe')).toEqual(edited)
  await disableClaudeMcp(ctx, 'probe', { force: true })
  expect(await readClaudeMcpEntry(ctx, 'probe')).toBeUndefined()
})

test('already removed outside → disable refuses unless --force', async () => {
  await enableClaudeMcp(ctx, 'probe', OURS)
  await writeServers(ctx, {})
  await expect(disableClaudeMcp(ctx, 'probe')).rejects.toBeInstanceOf(McpChangedOutsideError)
  await disableClaudeMcp(ctx, 'probe', { force: true })
  expect((await readMcpTargets(ctx.itemDir)).claude).toBeUndefined()
})

test('setConfig resync: ours is swapped for the new entry; a drifted one is refused', async () => {
  await enableClaudeMcp(ctx, 'probe', OURS)
  const next = { ...OURS, env: { PROBE_TOKEN: 't' } }
  await enableClaudeMcp(ctx, 'probe', next)
  expect(await readClaudeMcpEntry(ctx, 'probe')).toEqual(next)
  await writeServers(ctx, { probe: { ...next, args: ['changed'] } })
  await expect(enableClaudeMcp(ctx, 'probe', OURS)).rejects.toBeInstanceOf(McpChangedOutsideError)
})

test('--replace again after our takeover was edited outside is refused, edit and previous kept', async () => {
  const seed = { command: 'node', args: ['users.js'] }
  await writeServers(ctx, { probe: seed })
  await enableClaudeMcp(ctx, 'probe', OURS, { replace: true })
  const edited = { ...OURS, env: { EDITED: '1' } }
  await writeServers(ctx, { probe: edited })
  const before = await sha(ctx.claudeJsonPath)
  await expect(enableClaudeMcp(ctx, 'probe', OURS, { replace: true })).rejects.toThrow(/changed outside Agent Store after it replaced/)
  expect(await sha(ctx.claudeJsonPath)).toBe(before)
  expect((await readMcpTargets(ctx.itemDir)).claude?.previous).toEqual(seed)
})

test('a restore whose read-back differs fails and keeps previous in targets.json', async () => {
  const seed = { command: 'node' }
  await writeServers(ctx, { probe: seed })
  await enableClaudeMcp(ctx, 'probe', OURS, { replace: true })
  ctx.cli = fakeCli([], { mangleRestore: true })
  const err = await disableClaudeMcp(ctx, 'probe').catch(e => e)
  expect(err).toBeInstanceOf(McpRestoreMismatchError)
  expect((err as Error).message).toContain('"command":"node"')
  expect((await readMcpTargets(ctx.itemDir)).claude?.previous).toEqual(seed)
})

test('a user entry equal to ours is still the user\'s: conflict without --replace, restored after --replace', async () => {
  await writeServers(ctx, { probe: OURS })
  await expect(enableClaudeMcp(ctx, 'probe', OURS)).rejects.toBeInstanceOf(McpConflictError)
  expect(await readMcpTargets(ctx.itemDir)).toEqual({})
  await expect(disableClaudeMcp(ctx, 'probe', { expected: OURS })).rejects.toBeInstanceOf(McpChangedOutsideError)
  expect(await readClaudeMcpEntry(ctx, 'probe')).toEqual(OURS)

  await enableClaudeMcp(ctx, 'probe', OURS, { replace: true })
  expect((await readMcpTargets(ctx.itemDir)).claude?.previous).toEqual(OURS)
  await disableClaudeMcp(ctx, 'probe', { expected: OURS })
  expect(await readClaudeMcpEntry(ctx, 'probe')).toEqual(OURS)
})

test('an add that writes the entry and then fails keeps the claim, so the entry stays ours', async () => {
  const cli = ctx.cli!
  ctx.cli = { ...cli, async addJson(at, name, entry) { await cli.addJson(at, name, entry); throw new Error('exit 1 after write') } }
  await expect(enableClaudeMcp(ctx, 'probe', OURS)).rejects.toThrow('exit 1 after write')
  expect((await readMcpTargets(ctx.itemDir)).claude).toEqual({ name: 'probe', written: null, previous: null })
  ctx.cli = cli
  await enableClaudeMcp(ctx, 'probe', OURS)
  expect((await readMcpTargets(ctx.itemDir)).claude).toEqual({ name: 'probe', written: OURS, previous: null })
})

test('a claim left before anything was written does not block disable', async () => {
  await writeFile(join(ctx.itemDir, 'targets.json'), JSON.stringify({ claude: { name: 'probe', written: null, previous: null } }))
  await disableClaudeMcp(ctx, 'probe', { expected: OURS })
  expect(await readMcpTargets(ctx.itemDir)).toEqual({})
})

test('a resync add that writes and then fails is cleared and the old entry put back', async () => {
  await enableClaudeMcp(ctx, 'probe', OURS)
  const before = await readMcpTargets(ctx.itemDir)
  const cli = ctx.cli!
  ctx.cli = { ...cli, async addJson(at, name, entry) {
    await cli.addJson(at, name, entry)
    if ((entry as { env?: unknown }).env) throw new Error('exit 1 after write')
  } }
  await expect(enableClaudeMcp(ctx, 'probe', { ...OURS, env: { PROBE_TOKEN: 'new' } })).rejects.toThrow('exit 1 after write')
  expect(await readClaudeMcpEntry(ctx, 'probe')).toEqual(OURS)
  expect(await readMcpTargets(ctx.itemDir)).toEqual(before)
})

test('a resync remove that deletes the entry and then fails puts the old entry back', async () => {
  await enableClaudeMcp(ctx, 'probe', OURS)
  const before = await readMcpTargets(ctx.itemDir)
  const cli = ctx.cli!
  let failed = false
  ctx.cli = { ...cli, async remove(at, name) {
    await cli.remove(at, name)
    if (!failed) { failed = true; throw new Error('remove exited 1 after write') }
  } }
  await expect(enableClaudeMcp(ctx, 'probe', { ...OURS, env: { PROBE_TOKEN: 'new' } })).rejects.toThrow('remove exited 1 after write')
  expect(await readClaudeMcpEntry(ctx, 'probe')).toEqual(OURS)
  expect(await readMcpTargets(ctx.itemDir)).toEqual(before)
})

test('a --replace whose remove deletes the user entry and then fails puts it back and drops the record', async () => {
  const USERS = { type: 'stdio', command: 'node', args: ['users.js'] }
  await writeServers(ctx, { probe: USERS })
  const cli = ctx.cli!
  ctx.cli = { ...cli, async remove(at, name) {
    await cli.remove(at, name)
    if (at.claudeJsonPath === ctx.claudeJsonPath) throw new Error('remove exited 1 after write')
  } }
  await expect(enableClaudeMcp(ctx, 'probe', OURS, { replace: true })).rejects.toThrow('remove exited 1 after write')
  expect(await readClaudeMcpEntry(ctx, 'probe')).toEqual(USERS)
  expect(await readMcpTargets(ctx.itemDir)).toEqual({})
})

test('a resync remove that fails without deleting leaves the old entry alone', async () => {
  await enableClaudeMcp(ctx, 'probe', OURS)
  const before = await readMcpTargets(ctx.itemDir)
  const calls: string[] = []
  ctx.cli = { ...fakeCli(calls), async remove() { calls.push('remove (fails)'); throw new Error('remove failed') } }
  await expect(enableClaudeMcp(ctx, 'probe', { ...OURS, env: { PROBE_TOKEN: 'new' } })).rejects.toThrow('remove failed')
  expect(calls).toEqual(['remove (fails)'])
  expect(await readClaudeMcpEntry(ctx, 'probe')).toEqual(OURS)
  expect(await readMcpTargets(ctx.itemDir)).toEqual(before)
})

test('a resync whose add fails puts the old entry back and keeps the record', async () => {
  await enableClaudeMcp(ctx, 'probe', OURS)
  const before = await readMcpTargets(ctx.itemDir)
  const cli = ctx.cli!
  ctx.cli = { ...cli, async addJson(at, name, entry) {
    if ((entry as { env?: unknown }).env) throw new Error('add failed')
    await cli.addJson(at, name, entry)
  } }
  await expect(enableClaudeMcp(ctx, 'probe', { ...OURS, env: { PROBE_TOKEN: 'new' } })).rejects.toThrow('add failed')
  expect(await readClaudeMcpEntry(ctx, 'probe')).toEqual(OURS)
  expect(await readMcpTargets(ctx.itemDir)).toEqual(before)
})

test('without the binary: safe file edit with a backup, 0600', async () => {
  ctx.cli = null
  await writeServers(ctx, { other: OTHER })
  await enableClaudeMcp(ctx, 'probe', OURS)
  const json = JSON.parse(await readFile(ctx.claudeJsonPath, 'utf-8'))
  expect(json.mcpServers).toEqual({ other: OTHER, probe: OURS })
  const backups = await readdir(join(ctx.aasHome, 'agent-store', 'backups'))
  expect(backups.length).toBe(1)
  const { statSync } = await import('fs')
  expect(statSync(ctx.claudeJsonPath).mode & 0o777).toBe(0o600)
})
