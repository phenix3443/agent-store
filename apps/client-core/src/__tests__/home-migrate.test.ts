// Moving from ~/.agents to ~/.agent-store (#111): before and after, every tool
// resolves the same skills and runs the same MCP servers, nothing that is not ours
// moves, and the moved items keep working (disable/uninstall puts the user's
// configs back byte for byte).
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parse as parseToml } from '@iarna/toml'
import type { MCPItem, ProviderItem } from '@as/types'
import { EngineImpl } from '../engine'
import { homeMigrationPending, migrateHome, type HomeMigrationPaths } from '../home-migrate'
import { contentHash, MARKER } from '../skills/store'
import { ItemCatalog } from './helpers/item-catalog'

process.env['AS_CLAUDE_BIN'] = ''
process.env['AS_CODEX_BIN'] = ''

const publisher = { id: 'p', slug: 'p', name: 'P', avatarUrl: '', tier: 'community' as const }
const base = {
  id: 'i', name: 'T', description: 'd', version: '1.0.0', publisher, compatibleWith: ['claude' as const, 'codex' as const],
  tags: [], downloads: 0, rating: 0, status: 'published' as const, createdAt: '', updatedAt: '',
}
// Its command is relative, so the tool entries hold an absolute path into the item directory.
const localMcp: MCPItem = {
  ...base, slug: 'local-mcp', category: 'mcp', transport: 'stdio', serverCommand: './server --stdio', configSchema: { type: 'object' },
  installHook: { steps: [{ type: 'file', url: 'https://files.test/server', dest: 'server' }] },
}
const npxMcp: MCPItem = { ...base, slug: 'npx-mcp', category: 'mcp', transport: 'stdio', serverCommand: 'npx -y npx-mcp', configSchema: { type: 'object' }, installHook: { steps: [] } }
const provider: ProviderItem = {
  ...base, slug: 'prov', category: 'provider', configSchema: { type: 'object' }, supportedModels: [],
  installHook: { steps: [{ type: 'config', patch: { baseUrl: 'https://llm.example.com', apiKey: 'sk-1' } }] },
}
const SKILL_MD = '---\nname: sk-name\ndescription: d\n---\nbody\n'
const USER_CLAUDE_JSON = JSON.stringify({ numStartups: 3, mcpServers: { mine: { type: 'stdio', command: 'my-server', args: [] } } }, null, 2)
const USER_CONFIG_TOML = '# mine\nmodel = "gpt-5"\n'

let root: string
let p: HomeMigrationPaths
const origFetch = globalThis.fetch

const engineAt = (aasHome: string) => new EngineImpl(
  { aasHome, claudeConfigDir: p.claudeConfigDir, claudeJsonPath: p.claudeJsonPath, codexConfigDir: p.codexConfigDir },
  'http://localhost:3000', { catalog: new ItemCatalog() },
)

function file(path: string, body: string) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, body)
}

/** What an Agent Store from before 2026-11-12 left in ~/.agents, written by the same code paths. */
async function seedOldHome() {
  file(p.claudeJsonPath, USER_CLAUDE_JSON)
  file(join(p.codexConfigDir, 'config.toml'), USER_CONFIG_TOML)
  const old = engineAt(p.from)
  for (const slug of ['local-mcp', 'npx-mcp']) {
    await old.install(slug)
    await old.enable(slug, 'claude')
    await old.enable(slug, 'codex')
  }
  await old.install('prov')

  // A skill the old way: in ~/.agents/skills with our marker, Claude linked, Codex reading it natively.
  const dir = join(p.from, 'skills', 'sk')
  file(join(dir, 'SKILL.md'), SKILL_MD)
  file(join(dir, 'scripts', 'run.sh'), 'echo 1\n')
  const marker = { slug: 'sk', version: '1.0.0', source: null, contentHash: await contentHash(dir), runtimeNames: { claude: 'sk', codex: 'sk-name' }, manifest: { ...base, slug: 'sk', category: 'skill', contentUrl: '', installHook: { steps: [] } } }
  writeFileSync(join(dir, MARKER), JSON.stringify(marker, null, 2))
  mkdirSync(join(p.claudeConfigDir, 'skills'), { recursive: true })
  symlinkSync(dir, join(p.claudeConfigDir, 'skills', 'sk'), 'dir')
  const reg = JSON.parse(readFileSync(join(p.from, 'registry.json'), 'utf-8'))
  reg.installed.push({ slug: 'sk', category: 'skill', version: '1.0.0', installedAt: '', updatedAt: '', compatibleWith: ['claude', 'codex'], enabledFor: { codex: true, claude: true } })
  writeFileSync(join(p.from, 'registry.json'), JSON.stringify(reg, null, 2))

  // Not ours: another tool's skill in the shared root, and other files in ~/.agents.
  file(join(p.from, 'skills', 'users-own', 'SKILL.md'), '---\nname: users-own\ndescription: x\n---\n')
  file(join(p.from, 'other-tool.json'), '{"keep":true}')
  file(join(p.from, 'relay-token'), 'tok')
  file(join(p.from, 'usage.db'), 'sqlite bytes')
  // Older versions kept their backups in ~/.agents/agent-store/backups.
  mkdirSync(join(p.from, 'agent-store'), { recursive: true })
  if (existsSync(join(p.from, 'backups'))) renameSync(join(p.from, 'backups'), join(p.from, 'agent-store', 'backups'))
  file(join(p.from, 'agent-store', 'backups', 'old', 'settings.json'), '{}')
}

/** What each tool would run or read: resolved through every link. */
function behavior() {
  const claude = JSON.parse(readFileSync(p.claudeJsonPath, 'utf-8')).mcpServers
  const codex = (parseToml(readFileSync(join(p.codexConfigDir, 'config.toml'), 'utf-8')) as { mcp_servers: Record<string, { command: string; args: string[] }> }).mcp_servers
  const run = (entry: { command: string; args?: string[] }) => [existsSync(entry.command) ? readFileSync(entry.command, 'utf-8') : entry.command, ...(entry.args ?? [])]
  return {
    claudeMcp: Object.fromEntries(Object.entries(claude).map(([k, v]) => [k, run(v as { command: string; args: string[] })])),
    codexMcp: Object.fromEntries(Object.entries(codex).map(([k, v]) => [k, run(v)])),
    claudeSkill: readFileSync(realpathSync(join(p.claudeConfigDir, 'skills', 'sk', 'SKILL.md')), 'utf-8'),
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'as-home-migrate-'))
  p = {
    from: join(root, 'agents'), to: join(root, 'agent-store'),
    claudeConfigDir: join(root, 'claude'), claudeJsonPath: join(root, 'claude', '.claude.json'), codexConfigDir: join(root, 'codex'),
  }
  globalThis.fetch = (async (url: string) => {
    const u = String(url)
    for (const item of [localMcp, npxMcp, provider]) {
      if (u.endsWith(`/api/items/${item.slug}`)) return Response.json({ item })
    }
    if (u === 'https://files.test/server') return new Response('#!/bin/sh\necho server\n')
    throw new Error(`Unmocked URL: ${u}`)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = origFetch
  rmSync(root, { recursive: true, force: true })
})

test('moves what is ours, keeps every tool resolving the same things, and leaves the rest of ~/.agents alone', async () => {
  await seedOldHome()
  const before = behavior()
  expect(before.codexMcp['local-mcp'][0]).toBe('#!/bin/sh\necho server\n')

  const result = await migrateHome(p)
  expect(result?.steps.filter(s => s.result !== 'done')).toEqual([])

  // Same behavior, now from the new home.
  expect(behavior()).toEqual(before)
  const claude = JSON.parse(readFileSync(p.claudeJsonPath, 'utf-8')).mcpServers
  expect(claude['local-mcp'].command).toBe(join(p.to, 'mcps', 'local-mcp', 'server'))
  expect(readFileSync(join(p.codexConfigDir, 'config.toml'), 'utf-8')).toContain(join(p.to, 'mcps', 'local-mcp', 'server'))
  expect(readFileSync(join(p.codexConfigDir, 'config.toml'), 'utf-8')).not.toContain(p.from)

  // Skills: the library is outside every tool's path; each tool links to it under the same name.
  const lib = join(p.to, 'skills', 'sk')
  expect(readFileSync(join(lib, 'scripts', 'run.sh'), 'utf-8')).toBe('echo 1\n')
  expect(readlinkSync(join(p.claudeConfigDir, 'skills', 'sk'))).toBe(lib)
  expect(readlinkSync(join(p.codexConfigDir, 'skills', 'sk'))).toBe(lib)
  const reg = JSON.parse(readFileSync(join(p.to, 'registry.json'), 'utf-8'))
  const sk = reg.installed.find((e: { slug: string }) => e.slug === 'sk')
  expect(sk.enabledFor).toEqual({ codex: true, claude: true })
  expect(Object.keys(sk.deployments).sort()).toEqual(['claude', 'codex'])

  // Our files moved; provider config, relay token, usage and old backups came along.
  expect(readFileSync(join(p.to, 'providers', 'prov', 'config.json'), 'utf-8')).toContain('sk-1')
  expect(readFileSync(join(p.to, 'relay-token'), 'utf-8')).toBe('tok')
  expect(readFileSync(join(p.to, 'usage.db'), 'utf-8')).toBe('sqlite bytes')
  expect(existsSync(join(p.to, 'backups', 'old', 'settings.json'))).toBe(true)
  const backup = readdirSync(join(p.to, 'backups')).find(n => n.startsWith('home-migrate-'))!
  expect(readdirSync(join(p.to, 'backups', backup)).length).toBeGreaterThanOrEqual(3)

  // What is left in ~/.agents is not ours.
  expect(readdirSync(p.from).sort()).toEqual(['other-tool.json', 'skills'])
  expect(readdirSync(join(p.from, 'skills'))).toEqual(['users-own'])
  expect(readFileSync(join(p.from, 'other-tool.json'), 'utf-8')).toBe('{"keep":true}')

  expect(await migrateHome(p)).toBeNull()
})

test('after the move, disabling and uninstalling everything gives the user their configs back byte for byte', async () => {
  await seedOldHome()
  await migrateHome(p)
  const engine = engineAt(p.to)
  for (const e of await engine.list()) await engine.uninstall(e.slug)
  expect(readFileSync(p.claudeJsonPath, 'utf-8')).toBe(USER_CLAUDE_JSON)
  expect(readFileSync(join(p.codexConfigDir, 'config.toml'), 'utf-8')).toBe(USER_CONFIG_TOML)
  expect(readdirSync(join(p.claudeConfigDir, 'skills'))).toEqual([])
  expect(readdirSync(join(p.codexConfigDir, 'skills'))).toEqual([])
  expect(readdirSync(join(p.to, 'skills'))).toEqual([])
})

test('a run that stopped after the commit is finished by the next one, and repeating it changes nothing', async () => {
  await seedOldHome()
  await migrateHome(p)
  const after = behavior()
  const claudeJson = readFileSync(p.claudeJsonPath, 'utf-8')
  const state = JSON.parse(readFileSync(join(p.to, '.home-migration.json'), 'utf-8'))
  writeFileSync(join(p.to, '.home-migration.json'), JSON.stringify({ ...state, phase: 'copied' }))
  expect(await homeMigrationPending(p)).toBe(true)
  const again = await migrateHome(p)
  expect(again?.steps.filter(s => s.result === 'error')).toEqual([])
  expect(behavior()).toEqual(after)
  expect(readFileSync(p.claudeJsonPath, 'utf-8')).toBe(claudeJson)
  expect(await homeMigrationPending(p)).toBe(false)
})

test('nothing runs when the new home already exists, when there is no old registry, or when both are the same', async () => {
  await seedOldHome()
  mkdirSync(p.to)
  expect(await migrateHome(p)).toBeNull()
  expect(existsSync(join(p.from, 'registry.json'))).toBe(true)
  rmSync(p.to, { recursive: true })
  expect(await homeMigrationPending({ from: p.from, to: p.from })).toBe(false)
  rmSync(join(p.from, 'registry.json'))
  expect(await homeMigrationPending(p)).toBe(false)
})

test('a Codex path the user owns is left alone and the registry says the skill is off for Codex', async () => {
  await seedOldHome()
  file(join(p.codexConfigDir, 'skills', 'sk', 'SKILL.md'), 'my own codex skill\n')
  const result = await migrateHome(p)
  expect(result?.steps.find(s => s.result === 'skipped')?.message).toStartWith('codex: Refusing to replace')
  expect(readFileSync(join(p.codexConfigDir, 'skills', 'sk', 'SKILL.md'), 'utf-8')).toBe('my own codex skill\n')
  expect(lstatSync(join(p.claudeConfigDir, 'skills', 'sk')).isSymbolicLink()).toBe(true)
  const reg = JSON.parse(readFileSync(join(p.to, 'registry.json'), 'utf-8'))
  expect(reg.installed.find((e: { slug: string }) => e.slug === 'sk').enabledFor).toEqual({ codex: false, claude: true })
})
