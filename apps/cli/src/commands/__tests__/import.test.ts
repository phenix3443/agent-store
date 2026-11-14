import { test, expect } from 'bun:test'
import type { Engine, ImportScan } from '@as/types'
import { runImport } from '../import'
import { runDoctorCommand } from '../doctor'

const scan: ImportScan = {
  agents: [
    { agent: 'claude', binary: '/usr/bin/claude', version: '2.1.80 (Claude Code)', configDir: '/h/.claude', configDirExists: true, mcpConfigPath: '/h/.claude.json', mcpConfigExists: true, detected: true },
    { agent: 'codex', binary: null, version: null, configDir: '/h/.codex', configDirExists: false, mcpConfigPath: '/h/.codex/config.toml', mcpConfigExists: false, detected: false },
  ],
  skills: [
    { kind: 'skill', id: 'skill:notes', dirName: 'notes', name: 'notes', description: null, locations: [{ agent: 'claude', root: 'claude', path: '/h/.claude/skills/notes' }], contentHash: 'h', files: 1, importable: true },
    { kind: 'skill', id: 'skill:linked', dirName: 'linked', name: 'linked', description: null, locations: [{ agent: 'claude', root: 'claude', path: '/h/.claude/skills/linked', linkTarget: '/dot/linked' }], contentHash: null, files: 0, importable: false, reason: 'symlink' },
  ],
  mcps: [{ kind: 'mcp', id: 'mcp:github', name: 'github', importable: true, entries: [{ agent: 'claude', path: '/h/.claude.json', transport: 'stdio', command: 'npx', args: ['-y', 'pkg', '--token=***'], envNames: ['GITHUB_TOKEN'], headerNames: [], lossyKeys: [] }] }],
  catalogChecked: false,
  problems: [],
}

function engine(calls: unknown[][]): Engine {
  return {
    scanImports: async (o: unknown) => { calls.push(['scan', o]); return scan },
    applyImport: async (ids: string[], o: unknown) => { calls.push(['apply', ids, o]); return { importId: 'imp-1', items: [{ kind: 'skill', id: 'skill:notes', slug: 'notes', agents: ['claude'], paths: [] }] } },
    undoImport: async (id?: string, o?: unknown) => { calls.push(['undo', id, o]); return { importId: 'imp-1', items: [{ kind: 'skill', slug: 'notes', result: 'bytes', paths: [] }] } },
    listImports: async () => [],
  } as unknown as Engine
}

test('scan prints the agents, every candidate and why some cannot be imported', async () => {
  const lines: string[] = []
  expect(await runImport(engine([]), ['scan', '--offline'], s => lines.push(s))).toBe(0)
  const text = lines.join('\n')
  expect(text).toContain('Claude Code: found (2.1.80 (Claude Code))')
  expect(text).toContain('Codex: not found; CLI not on PATH')
  expect(text).toContain('skill:linked  (not importable: a link to a skill kept elsewhere')
  expect(text).toContain('npx -y pkg --token=***  (env: GITHUB_TOKEN)')
})

test('apply --all takes only the importable candidates; undo passes --force', async () => {
  const calls: unknown[][] = []
  const e = engine(calls)
  expect(await runImport(e, ['apply', '--all', '--offline'], () => {})).toBe(0)
  expect(calls[1]).toEqual(['apply', ['skill:notes', 'mcp:github'], { offline: true }])
  expect(await runImport(e, ['undo', 'imp-1', '--force'], () => {})).toBe(0)
  expect(calls[2]).toEqual(['undo', 'imp-1', { force: true }])
  expect(await runImport(e, ['apply'], () => {})).toBe(2)
})

test('a failure exits 1 with the message', async () => {
  const lines: string[] = []
  const failing = { undoImport: async () => { throw new Error('Nothing to undo') } } as unknown as Engine
  expect(await runImport(failing, ['undo'], s => lines.push(s))).toBe(1)
  expect(lines).toEqual(['  Error: Nothing to undo'])
})

test('doctor prints what it detected before the findings', async () => {
  const lines: string[] = []
  await runDoctorCommand(async () => [], s => lines.push(s), async () => scan.agents)
  expect(lines[0]).toContain('Claude Code found: /usr/bin/claude (2.1.80 (Claude Code))')
  expect(lines[1]).toContain('Codex       not found: CLI not on PATH, config files are edited directly; /h/.codex (missing)')
})
