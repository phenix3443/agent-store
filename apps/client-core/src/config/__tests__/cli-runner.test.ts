import { afterEach, beforeEach, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, writeFileSync } from 'fs'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { cliFallbackNote, findCli, runCli, type CliLookup } from '../cli-runner'
import { enableClaudeMcp, resolveClaudeCli } from '../claude-mcp'
import { resolveCodexCli } from '../codex-mcp'

// Shims as cmd-shim 9 writes them for `npm install -g` on Windows.
const HEAD = '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n'
/** A bin that is itself an executable (Claude Code: `bin/claude.exe`). */
const exeShim = (target: string) => `${HEAD}"%dp0%\\${target}"   %*\r\n`
/** A bin with a `#!/usr/bin/env node` line (Codex: `bin/codex.js`). */
const nodeShim = (target: string, prog = 'node') => `${HEAD}\r\n`
  + `IF EXIST "%dp0%\\${prog}.exe" (\r\n  SET "_prog=%dp0%\\${prog}.exe"\r\n) ELSE (\r\n  SET "_prog=${prog}"\r\n)\r\n\r\n`
  + 'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & '
  + `set PATHEXT=%PATHEXT:;.JS;=;% & "%_prog%"  "%dp0%\\${target}" %*\r\n`
const SH_SHIM = '#!/bin/sh\nexec node "$basedir/node_modules/x/cli.js" "$@"\n'
const PS1_SHIM = '#!/usr/bin/env pwsh\n& "$basedir/node_modules/x/cli.js" $args\n'

const CLAUDE_EXE = 'node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe'
const CODEX_JS = 'node_modules\\@openai\\codex\\bin\\codex.js'

let root: string
let npm: string
let local: string

function put(path: string, content = '') {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}
const nested = (dir: string, rel: string) => join(dir, ...rel.split('\\'))

/** What `npm install -g @anthropic-ai/claude-code` leaves in the prefix. */
function npmClaude() {
  put(join(npm, 'claude'), SH_SHIM)
  put(join(npm, 'claude.ps1'), PS1_SHIM)
  put(join(npm, 'claude.cmd'), exeShim(CLAUDE_EXE))
  put(nested(npm, CLAUDE_EXE), 'MZ')
}

/** What `npm install -g @openai/codex` leaves in the prefix. */
function npmCodex() {
  put(join(npm, 'codex'), SH_SHIM)
  put(join(npm, 'codex.ps1'), PS1_SHIM)
  put(join(npm, 'codex.cmd'), nodeShim(CODEX_JS))
  put(nested(npm, CODEX_JS), '#!/usr/bin/env node\n')
}

const win = (dirs: string[], extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv =>
  ({ PATH: dirs.join(';'), PATHEXT: '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC', ...extra })

function expectNoBatch(r: CliLookup) {
  if (r.kind === 'found') expect(r.cli.command).not.toMatch(/\.(cmd|bat)$/i)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'as-cli-runner-'))
  npm = join(root, 'npm')
  local = join(root, 'home', '.local', 'bin')
  mkdirSync(npm, { recursive: true })
  mkdirSync(local, { recursive: true })
})

afterEach(async () => { await rm(root, { recursive: true, force: true }) })

// ── Windows: PATHEXT ────────────────────────────────────────────────────────

test('Windows: npm Claude Code resolves through PATHEXT to the .exe its .cmd shim points at, not the sh or ps1 shim', () => {
  npmClaude()
  const r = findCli('claude', 'AS_CLAUDE_BIN', win([npm]), 'win32')
  expect(r).toEqual({ kind: 'found', cli: { command: nested(npm, CLAUDE_EXE), args: [] }, via: 'shim-exe' })
})

test('Windows: PATH and PATHEXT are read whatever their case, and quoted PATH entries work', () => {
  npmClaude()
  const r = findCli('claude', 'AS_CLAUDE_BIN', { Path: `"${npm}"`, PathExt: '.exe;.cmd' }, 'win32')
  expect(r.kind === 'found' && r.cli.command).toBe(nested(npm, CLAUDE_EXE))
})

test('Windows: an extension missing from PATHEXT is not a match', () => {
  npmClaude()
  expect(findCli('claude', 'AS_CLAUDE_BIN', win([npm], { PATHEXT: '.EXE;.COM' }), 'win32')).toEqual({ kind: 'missing' })
})

test('Windows: the extensionless sh shim alone is not a match', () => {
  put(join(npm, 'claude'), SH_SHIM)
  expect(findCli('claude', 'AS_CLAUDE_BIN', win([npm]), 'win32')).toEqual({ kind: 'missing' })
})

test('Windows: PATHEXT defaults to .COM;.EXE;.BAT;.CMD when unset', () => {
  npmClaude()
  const r = findCli('claude', 'AS_CLAUDE_BIN', { PATH: npm }, 'win32')
  expect(r.kind === 'found' && r.via).toBe('shim-exe')
})

test('Windows: a real claude.exe anywhere on PATH wins over an npm shim earlier on PATH', () => {
  npmClaude()
  put(join(local, 'claude.exe'), 'MZ')
  const r = findCli('claude', 'AS_CLAUDE_BIN', win([npm, local]), 'win32')
  expect(r).toEqual({ kind: 'found', cli: { command: join(local, 'claude.exe'), args: [] }, via: 'path' })
})

test('Windows: PATHEXT order decides within a directory', () => {
  put(join(local, 'claude.com'), 'MZ')
  put(join(local, 'claude.exe'), 'MZ')
  const r = findCli('claude', 'AS_CLAUDE_BIN', win([local], { PATHEXT: '.EXE;.COM' }), 'win32')
  expect(r.kind === 'found' && r.cli.command).toBe(join(local, 'claude.exe'))
})

// ── Windows: .cmd shims run without cmd.exe ─────────────────────────────────

test('Windows: npm Codex runs codex.js with the node.exe next to the shim', () => {
  npmCodex()
  put(join(npm, 'node.exe'), 'MZ')
  const r = findCli('codex', 'AS_CODEX_BIN', win([npm]), 'win32')
  expect(r).toEqual({ kind: 'found', cli: { command: join(npm, 'node.exe'), args: [nested(npm, CODEX_JS)] }, via: 'shim-node' })
})

test('Windows: npm Codex runs codex.js with node.exe from PATH when none is next to the shim', () => {
  npmCodex()
  const nodeDir = join(root, 'nodejs')
  put(join(nodeDir, 'node.cmd'), '@echo off\r\n')
  put(join(nodeDir, 'node.exe'), 'MZ')
  const r = findCli('codex', 'AS_CODEX_BIN', win([npm, nodeDir]), 'win32')
  expect(r).toEqual({ kind: 'found', cli: { command: join(nodeDir, 'node.exe'), args: [nested(npm, CODEX_JS)] }, via: 'shim-node' })
})

test('Windows: a node shim with no node.exe anywhere is unrunnable, and the CLI counts as absent', () => {
  npmCodex()
  const env = win([npm])
  const r = findCli('codex', 'AS_CODEX_BIN', env, 'win32')
  expect(r.kind).toBe('unrunnable')
  expect(r.kind === 'unrunnable' && r.reason).toContain('node.exe is not on PATH')
  expect(resolveCodexCli(env, 'win32')).toBeNull()
})

test('Windows: a shim for an interpreter other than node is unrunnable', () => {
  put(join(npm, 'codex.cmd'), nodeShim(CODEX_JS, 'bun'))
  put(nested(npm, CODEX_JS), '')
  put(join(npm, 'bun.exe'), 'MZ')
  const r = findCli('codex', 'AS_CODEX_BIN', win([npm]), 'win32')
  expect(r.kind === 'unrunnable' && r.reason).toContain('does not start directly')
})

test('Windows: a shim whose target is gone is unrunnable', () => {
  put(join(npm, 'claude.cmd'), exeShim(CLAUDE_EXE))
  const r = findCli('claude', 'AS_CLAUDE_BIN', win([npm]), 'win32')
  expect(r.kind === 'unrunnable' && r.reason).toContain('does not exist')
})

test('Windows: a hand-written .cmd or a .bat is unrunnable, never run', () => {
  put(join(npm, 'claude.cmd'), '@echo off\r\nC:\\tools\\claude-real.exe %*\r\n')
  put(join(local, 'claude.bat'), exeShim(CLAUDE_EXE))
  put(nested(local, CLAUDE_EXE), 'MZ')
  const r = findCli('claude', 'AS_CLAUDE_BIN', win([npm, local]), 'win32')
  expect(r).toEqual({ kind: 'unrunnable', shim: join(npm, 'claude.cmd'), reason: 'not an npm shim Agent Store can read' })
})

test('Windows: a later shim that can be run is used when an earlier one cannot', () => {
  put(join(npm, 'claude.cmd'), '@echo off\r\n')
  put(join(local, 'claude.cmd'), exeShim(CLAUDE_EXE))
  put(nested(local, CLAUDE_EXE), 'MZ')
  const r = findCli('claude', 'AS_CLAUDE_BIN', win([npm, local]), 'win32')
  expect(r.kind === 'found' && r.cli.command).toBe(nested(local, CLAUDE_EXE))
})

test('Windows: AS_CLAUDE_BIN pointing at a .cmd shim is resolved the same way; empty means not installed', () => {
  npmClaude()
  const r = findCli('claude', 'AS_CLAUDE_BIN', win([], { AS_CLAUDE_BIN: join(npm, 'claude.cmd') }), 'win32')
  expect(r).toEqual({ kind: 'found', cli: { command: nested(npm, CLAUDE_EXE), args: [] }, via: 'shim-exe' })
  expect(findCli('claude', 'AS_CLAUDE_BIN', win([npm], { AS_CLAUDE_BIN: '' }), 'win32')).toEqual({ kind: 'missing' })
})

test('Windows: no lookup ever returns a batch file', () => {
  npmClaude()
  npmCodex()
  put(join(local, 'claude.bat'), '@echo off\r\n')
  for (const env of [win([npm]), win([local, npm]), win([local]), win([npm], { PATHEXT: '.CMD;.BAT' })]) {
    expectNoBatch(findCli('claude', 'AS_CLAUDE_BIN', env, 'win32'))
    expectNoBatch(findCli('codex', 'AS_CODEX_BIN', env, 'win32'))
  }
})

// ── Fallback to the file edit ───────────────────────────────────────────────

test('Windows: an unrunnable Claude shim falls back to editing .claude.json, and says so', async () => {
  put(join(npm, 'claude.cmd'), exeShim(CLAUDE_EXE))
  const env = win([npm])
  const cli = resolveClaudeCli(env, 'win32')
  expect(cli).toBeNull()

  const claudeConfigDir = join(root, 'claude')
  const ctx = {
    aasHome: join(root, 'agents'),
    claudeConfigDir,
    claudeJsonPath: join(claudeConfigDir, '.claude.json'),
    itemDir: join(root, 'agents', 'mcps', 'context7'),
    cli,
  }
  mkdirSync(ctx.itemDir, { recursive: true })
  const entry = { type: 'stdio' as const, command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0', '--q="a b" & ^x'] }
  await enableClaudeMcp(ctx, 'context7', entry)
  expect(JSON.parse(await readFile(ctx.claudeJsonPath, 'utf-8')).mcpServers.context7).toEqual(entry)

  const note = cliFallbackNote('Claude Code', ctx.claudeJsonPath, findCli('claude', 'AS_CLAUDE_BIN', env, 'win32'))
  expect(note).toContain(join(npm, 'claude.cmd'))
  expect(note).toContain(`edited ${ctx.claudeJsonPath} directly`)
})

test('no fallback note when the CLI was found or is simply missing', () => {
  npmClaude()
  expect(cliFallbackNote('Claude Code', 'x', findCli('claude', 'AS_CLAUDE_BIN', win([npm]), 'win32'))).toBeUndefined()
  expect(cliFallbackNote('Claude Code', 'x', { kind: 'missing' })).toBeUndefined()
})

// ── macOS / Linux: unchanged ────────────────────────────────────────────────

test('POSIX: the first executable `<dir>/<name>` on PATH; non-executable files and PATHEXT are ignored', () => {
  const a = join(root, 'a')
  const b = join(root, 'b')
  put(join(a, 'claude'), '#!/bin/sh\n')
  chmodSync(join(a, 'claude'), 0o644)
  put(join(a, 'claude.cmd'), exeShim(CLAUDE_EXE))
  chmodSync(join(a, 'claude.cmd'), 0o755)
  put(join(b, 'claude'), '#!/bin/sh\n')
  chmodSync(join(b, 'claude'), 0o755)
  const r = findCli('claude', 'AS_CLAUDE_BIN', { PATH: [a, b].join(':'), PATHEXT: '.CMD' }, 'linux')
  expect(r).toEqual({ kind: 'found', cli: { command: join(b, 'claude'), args: [] }, via: 'path' })
  expect(findCli('claude', 'AS_CLAUDE_BIN', { PATH: a }, 'darwin')).toEqual({ kind: 'missing' })
})

test('POSIX: the override is used as given', () => {
  expect(findCli('codex', 'AS_CODEX_BIN', { PATH: '', AS_CODEX_BIN: '/opt/codex' }, 'linux'))
    .toEqual({ kind: 'found', cli: { command: '/opt/codex', args: [] }, via: 'override' })
  expect(findCli('codex', 'AS_CODEX_BIN', { AS_CODEX_BIN: '' }, 'darwin')).toEqual({ kind: 'missing' })
})

// ── Arguments reach the program unchanged ───────────────────────────────────

test('runCli passes the prefix arguments, then each argument as is: quotes, spaces, & and ^ included', async () => {
  const script = join(root, 'argv.js')
  put(script, 'console.log(JSON.stringify(process.argv.slice(2)))\n')
  const args = [
    'mcp', 'add-json', '--scope', 'user', 'context7',
    JSON.stringify({ type: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0'] }),
    'with space', 'a&b', 'c^d', '"quoted"', '%PATH%', '',
  ]
  const r = await runCli({ command: process.execPath, args: [script] }, args, { ...process.env })
  expect(r.code).toBe(0)
  expect(JSON.parse(r.stdout)).toEqual(args)
})
