import { afterEach, beforeEach, expect, test } from 'bun:test'
import { createHash } from 'crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { parse, stringify, type JsonMap } from '@iarna/toml'
import {
  codexAddArgs, codexUnrestorableKeys, disableCodexMcp, enableCodexMcp, readCodexMcpEntry, toCodexEntry, trialRestore,
  type CodexLocation, type CodexMcpCli, type CodexMcpContext, type CodexMcpEntry,
} from '../codex-mcp'
import { McpChangedOutsideError, McpConflictError, McpNotRestorableError, McpRestoreMismatchError } from '../mcp-errors'
import { ConfigParseError } from '../safe-file'
import { readMcpTargets } from '../mcp-targets'

// Mimics `codex mcp add/remove` 0.163.0 (§1.1-4, §1.1-6): the whole table is
// rebuilt from the flags, so `args = []`/`env = {}` disappear, and comments
// outside mcp_servers survive while the TOML is re-serialized.
async function readToml(at: CodexLocation): Promise<Record<string, unknown>> {
  try { return parse(await readFile(join(at.codexHome, 'config.toml'), 'utf-8')) as unknown as Record<string, unknown> } catch { return {} }
}

function fakeCli(calls: string[] = [], opts: { mangleRestore?: boolean } = {}): CodexMcpCli {
  return {
    async version() { return 'codex-cli 0.163.0 (fake)' },
    async add(at, name, entry) {
      calls.push(codexAddArgs(name, entry).join(' '))
      const cfg = await readToml(at)
      const servers = (cfg['mcp_servers'] ?? {}) as Record<string, unknown>
      const e: Record<string, unknown> = { ...entry }
      if (Array.isArray(e['args']) && !(e['args'] as unknown[]).length) delete e['args']
      if (e['env'] && !Object.keys(e['env'] as object).length) delete e['env']
      if (opts.mangleRestore && at.home === undefined && e['command'] === 'node' && !e['args']) e['args'] = ['mangled']
      servers[name] = e
      cfg['mcp_servers'] = servers
      await mkdir(at.codexHome, { recursive: true })
      await writeFile(join(at.codexHome, 'config.toml'), stringify(cfg as JsonMap))
    },
    async remove(at, name) {
      calls.push(`mcp remove ${name}`)
      const cfg = await readToml(at)
      const servers = (cfg['mcp_servers'] ?? {}) as Record<string, unknown>
      if (!(name in servers)) throw new Error(`No MCP server named '${name}' found`)
      delete servers[name]
      cfg['mcp_servers'] = servers
      await writeFile(join(at.codexHome, 'config.toml'), stringify(cfg as JsonMap))
    },
  }
}

let root: string
let ctx: CodexMcpContext
const OURS: CodexMcpEntry = { command: 'node', args: ['/probe/as-probe-mcp.mjs'] }
const configFile = () => join(ctx.codexHome, 'config.toml')
const sha = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'as-codex-mcp-'))
  ctx = { aasHome: join(root, 'agents'), codexHome: join(root, 'codex'), itemDir: join(root, 'agents', 'mcps', 'probe'), cli: fakeCli() }
  await mkdir(ctx.itemDir, { recursive: true })
  await mkdir(ctx.codexHome, { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

// ── field mapping and argv ────────────────────────────────────────────────────

test('toCodexEntry maps stdio and http fields and rejects sse and headers', () => {
  expect(toCodexEntry('s', { transport: 'stdio', command: 'node', args: ['a b'], env: { K: 'v' } }))
    .toEqual({ command: 'node', args: ['a b'], env: { K: 'v' } })
  expect(toCodexEntry('s', { transport: 'stdio', command: 'node', args: [], env: {} })).toEqual({ command: 'node' })
  expect(toCodexEntry('s', { transport: 'http', url: 'https://x', headers: {}, bearer: { env: 'TOK', value: 'secret' } }))
    .toEqual({ url: 'https://x', bearer_token_env_var: 'TOK' })
  expect(() => toCodexEntry('s', { transport: 'sse', url: 'https://x', headers: {} })).toThrow('SSE')
  expect(() => toCodexEntry('s', { transport: 'http', url: 'https://x', headers: { 'X-A': '1' } })).toThrow('X-A')
})

test('codexAddArgs passes command and args as separate argv items', () => {
  expect(codexAddArgs('p', { command: 'node', args: ['/a b/x.mjs', '--greeting', 'hello world'], env: { K: 'v w' } }))
    .toEqual(['mcp', 'add', 'p', '--env', 'K=v w', '--', 'node', '/a b/x.mjs', '--greeting', 'hello world'])
  expect(codexAddArgs('p', { url: 'https://x', bearer_token_env_var: 'TOK' }))
    .toEqual(['mcp', 'add', 'p', '--url', 'https://x', '--bearer-token-env-var', 'TOK'])
})

test('restorable key matrix', () => {
  const ok = [
    { command: 'node' },
    { command: 'node', args: ['a b'], env: { K: 'v' } },
    { command: 'node', args: [], env: {} },
    { url: 'https://x' },
    { url: 'https://x', bearer_token_env_var: 'TOK' },
  ]
  for (const e of ok) expect(codexUnrestorableKeys(e)).toEqual([])
  const bad: Array<[unknown, string]> = [
    [{ url: 'u', http_headers: { A: '1' } }, 'http_headers'],
    [{ url: 'u', env_http_headers: { A: 'B' } }, 'env_http_headers'],
    [{ command: 'c', startup_timeout_sec: 37 }, 'startup_timeout_sec'],
    [{ command: 'c', tool_timeout_sec: 5 }, 'tool_timeout_sec'],
    [{ command: 'c', enabled: true }, 'enabled'],
    [{ command: 'c', enabled: false }, 'enabled'],
    [{ command: 'c', cwd: '/x' }, 'cwd'],
    [{ command: 'c', env_vars: ['A'] }, 'env_vars'],
    [{ command: 'c', enabled_tools: [] }, 'enabled_tools'],
    [{ command: 'c', disabled_tools: ['x'] }, 'disabled_tools'],
    [{ url: 'u', oauth_resource: 'r' }, 'oauth_resource'],
    [{ command: 'c', unknown: 1 }, 'unknown'],
    [{ command: 'c', url: 'u' }, 'command/url (exactly one is needed)'],
    [{ command: 'c', args: [1] }, 'args'],
    [{ command: 'c', env: { K: 1 } }, 'env'],
  ]
  for (const [e, key] of bad) expect(codexUnrestorableKeys(e)).toContain(key)
})

// ── preflight / conflict ──────────────────────────────────────────────────────

test('enable adds the table and records the read-back', async () => {
  await enableCodexMcp(ctx, 'probe', OURS)
  expect(await readCodexMcpEntry(ctx, 'probe')).toEqual(OURS)
  expect((await readMcpTargets(ctx.itemDir)).codex).toEqual({ name: 'probe', written: OURS, previous: null })
  expect((await stat(configFile())).mode & 0o777).toBe(0o600)
})

test('a same-name user table is a conflict and the file stays byte-identical', async () => {
  await writeFile(configFile(), '# mine\n[mcp_servers.probe]\ncommand = "users-own"\n')
  const before = await sha(configFile())
  const calls: string[] = []
  ctx.cli = fakeCli(calls)
  await expect(enableCodexMcp(ctx, 'probe', OURS)).rejects.toBeInstanceOf(McpConflictError)
  expect(await sha(configFile())).toBe(before)
  expect(calls).toEqual([])
})

test('a config.toml that does not parse aborts before any CLI call', async () => {
  await writeFile(configFile(), '[mcp_servers.probe\ncommand = ')
  const before = await sha(configFile())
  const calls: string[] = []
  ctx.cli = fakeCli(calls)
  await expect(enableCodexMcp(ctx, 'probe', OURS)).rejects.toBeInstanceOf(ConfigParseError)
  expect(await sha(configFile())).toBe(before)
  expect(calls).toEqual([])
})

// ── --replace ─────────────────────────────────────────────────────────────────

test('--replace refuses a table the CLI cannot write back, naming the keys, file byte-identical', async () => {
  await writeFile(configFile(), '[mcp_servers.probe]\nurl = "https://example.invalid/mcp"\nhttp_headers = { X-Test = "preserve-me" }\nstartup_timeout_sec = 37\nenabled = false\n')
  const before = await sha(configFile())
  const err = await enableCodexMcp(ctx, 'probe', OURS, { replace: true }).catch(e => e)
  expect(err).toBeInstanceOf(McpNotRestorableError)
  expect((err as McpNotRestorableError).keys).toEqual(['enabled', 'http_headers', 'startup_timeout_sec'])
  expect(await sha(configFile())).toBe(before)
})

for (const [label, seedToml, seed] of [
  ['stdio with spaced arg and env', '[mcp_servers.probe]\ncommand = "node"\nargs = ["/a b/x.mjs"]\n[mcp_servers.probe.env]\nK = "v w"\n', { command: 'node', args: ['/a b/x.mjs'], env: { K: 'v w' } }],
  ['url + bearer', '[mcp_servers.probe]\nurl = "https://x"\nbearer_token_env_var = "TOK"\n', { url: 'https://x', bearer_token_env_var: 'TOK' }],
  ['command only', '[mcp_servers.probe]\ncommand = "node"\n', { command: 'node' }],
  ['explicit empty args/env', '[mcp_servers.probe]\ncommand = "node"\nargs = []\nenv = {}\n', { command: 'node', args: [], env: {} }],
] as const) {
  for (const how of ['disable', 'force'] as const) {
    test(`--replace takes over and ${how === 'force' ? 'a forced disable' : 'disable'} restores: ${label}`, async () => {
      await writeFile(configFile(), `top = 1\n\n${seedToml}\n[mcp_servers.other]\ncommand = "other"\n`)
      await enableCodexMcp(ctx, 'probe', OURS, { replace: true })
      expect(await readCodexMcpEntry(ctx, 'probe')).toEqual(OURS)
      expect((await readMcpTargets(ctx.itemDir)).codex?.previous).toEqual(seed)
      await disableCodexMcp(ctx, 'probe', { force: how === 'force' })
      const back = await readCodexMcpEntry(ctx, 'probe') as Record<string, unknown>
      // Comparison rule: explicit-empty args/env come back absent.
      const expected = { ...seed } as Record<string, unknown>
      if (Array.isArray(expected['args']) && !(expected['args'] as unknown[]).length) delete expected['args']
      if (expected['env'] && !Object.keys(expected['env'] as object).length) delete expected['env']
      expect(back).toEqual(expected)
      expect(await readCodexMcpEntry(ctx, 'other')).toEqual({ command: 'other' })
      expect((await readMcpTargets(ctx.itemDir)).codex).toBeUndefined()
    })
  }
}

test('trialRestore runs in a scratch CODEX_HOME and removes it', async () => {
  const before = await readdir(tmpdir())
  expect(await trialRestore(fakeCli(), 'probe', { command: 'node', args: ['x'] })).toEqual([])
  const leftover = (await readdir(tmpdir())).filter(n => n.startsWith('as-codex-trial-') && !before.includes(n))
  expect(leftover).toEqual([])
})

test('a trial whose read-back differs rejects --replace and keeps the real file', async () => {
  const lossy: CodexMcpCli = { ...fakeCli(), async add(at, name, entry) {
    await fakeCli().add(at, name, { ...entry, ...('command' in entry ? { args: ['changed'] } : {}) } as CodexMcpEntry)
  } }
  ctx.cli = lossy
  await writeFile(configFile(), '[mcp_servers.probe]\ncommand = "node"\nargs = ["x"]\n')
  const before = await sha(configFile())
  const err = await enableCodexMcp(ctx, 'probe', OURS, { replace: true }).catch(e => e)
  expect(err).toBeInstanceOf(McpNotRestorableError)
  expect((err as McpNotRestorableError).keys).toEqual(['args'])
  expect(await sha(configFile())).toBe(before)
})

test('a restore whose read-back differs exits non-zero and keeps previous', async () => {
  await writeFile(configFile(), '[mcp_servers.probe]\ncommand = "node"\n')
  await enableCodexMcp(ctx, 'probe', OURS, { replace: true })
  ctx.cli = fakeCli([], { mangleRestore: true })
  await expect(disableCodexMcp(ctx, 'probe')).rejects.toBeInstanceOf(McpRestoreMismatchError)
  const rec = (await readMcpTargets(ctx.itemDir)).codex
  expect(rec?.previous).toEqual({ command: 'node' })
  expect(rec?.written).toBeNull()
})

test('--replace without the codex binary is refused', async () => {
  ctx.cli = null
  await writeFile(configFile(), '[mcp_servers.probe]\ncommand = "node"\n')
  const before = await sha(configFile())
  await expect(enableCodexMcp(ctx, 'probe', OURS, { replace: true })).rejects.toThrow('codex CLI is not installed')
  expect(await sha(configFile())).toBe(before)
})

// ── external edits ────────────────────────────────────────────────────────────

test('disable refuses an entry changed outside Agent Store; --force removes it', async () => {
  await enableCodexMcp(ctx, 'probe', OURS)
  const cfg = await readToml(ctx)
  ;(cfg['mcp_servers'] as Record<string, Record<string, unknown>>)['probe']['args'] = ['edited']
  await writeFile(configFile(), stringify(cfg as JsonMap))
  await expect(disableCodexMcp(ctx, 'probe')).rejects.toBeInstanceOf(McpChangedOutsideError)
  expect(await readCodexMcpEntry(ctx, 'probe')).toEqual({ command: 'node', args: ['edited'] })
  await disableCodexMcp(ctx, 'probe', { force: true })
  expect(await readCodexMcpEntry(ctx, 'probe')).toBeUndefined()
})

test('setConfig resync replaces our entry and refuses a drifted one', async () => {
  await enableCodexMcp(ctx, 'probe', OURS)
  const next: CodexMcpEntry = { ...OURS, env: { K: 'new' } }
  await enableCodexMcp(ctx, 'probe', next)
  expect(await readCodexMcpEntry(ctx, 'probe')).toEqual(next)
  await writeFile(configFile(), '[mcp_servers.probe]\ncommand = "drifted"\n')
  await expect(enableCodexMcp(ctx, 'probe', OURS)).rejects.toBeInstanceOf(McpChangedOutsideError)
})

// ── fallback without the binary ───────────────────────────────────────────────

test('without the binary: text edit keeps comments, backs up, round-trips', async () => {
  ctx.cli = null
  const before = '# top comment\nmodel = "o3" # why\n\n[mcp_servers.other]\n# inside other\ncommand = "other"\n'
  await writeFile(configFile(), before)
  await enableCodexMcp(ctx, 'probe', { command: 'node', args: ['a b'], env: { K: 'v' } })
  const text = await readFile(configFile(), 'utf-8')
  expect(text.startsWith(before)).toBe(true)
  expect(await readCodexMcpEntry(ctx, 'probe')).toEqual({ command: 'node', args: ['a b'], env: { K: 'v' } })
  expect((await readdir(join(ctx.aasHome, 'agent-store', 'backups'))).length).toBe(1)
  await disableCodexMcp(ctx, 'probe')
  expect(await readFile(configFile(), 'utf-8')).toBe(before)
})

test('without the binary: an inline-table entry is not edited', async () => {
  ctx.cli = null
  await writeFile(configFile(), '[mcp_servers]\nprobe = { command = "node", args = ["/probe/as-probe-mcp.mjs"] }\n')
  const before = await sha(configFile())
  await expect(disableCodexMcp(ctx, 'probe', { force: true })).rejects.toThrow('inline table')
  expect(await sha(configFile())).toBe(before)
})

test('--replace over our drifted takeover is refused and keeps the saved entry', async () => {
  await writeFile(configFile(), '[mcp_servers.probe]\ncommand = "node"\n')
  await enableCodexMcp(ctx, 'probe', OURS, { replace: true })
  await writeFile(configFile(), '[mcp_servers.probe]\ncommand = "edited"\n')
  const before = await sha(configFile())
  await expect(enableCodexMcp(ctx, 'probe', OURS, { replace: true })).rejects.toThrow('--force')
  expect(await sha(configFile())).toBe(before)
  expect((await readMcpTargets(ctx.itemDir)).codex?.previous).toEqual({ command: 'node' })
})

test('enable creates a missing CODEX_HOME and a private config.toml', async () => {
  await rm(ctx.codexHome, { recursive: true, force: true })
  await enableCodexMcp(ctx, 'probe', OURS)
  expect((await stat(configFile())).mode & 0o777).toBe(0o600)
})

test('without the binary: comments above the next table survive removing ours', async () => {
  ctx.cli = null
  const before = 'top = 1\n\n# about other\n[mcp_servers.other]\ncommand = "other"\n'
  await writeFile(configFile(), before.replace('# about other', '[mcp_servers.probe]\n# ours\ncommand = "node"\nargs = ["/probe/as-probe-mcp.mjs"]\n\n# about other'))
  await disableCodexMcp(ctx, 'probe', { force: true })
  expect(await readFile(configFile(), 'utf-8')).toBe(before)
})

test('without the binary: an edit that would change anything else is refused', async () => {
  ctx.cli = null
  const text = '[notes]\ntext = """\n[mcp_servers.probe]\nkeep me\n"""\n\n[mcp_servers.probe]\ncommand = "node"\nargs = ["/probe/as-probe-mcp.mjs"]\n'
  await writeFile(configFile(), text)
  await expect(disableCodexMcp(ctx, 'probe', { force: true })).rejects.toThrow("can't edit")
  expect(await readFile(configFile(), 'utf-8')).toBe(text)
})

test('without the binary: a dotted-key entry is reported as not editable, not as a broken file', async () => {
  ctx.cli = null
  await writeFile(configFile(), '[mcp_servers]\nprobe.command = "users"\n')
  await expect(enableCodexMcp(ctx, 'probe', OURS, { replace: false })).rejects.toBeInstanceOf(McpConflictError)
  await expect(disableCodexMcp(ctx, 'probe', { force: true })).rejects.toThrow("can't edit")
})
