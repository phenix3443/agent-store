// Install/enable policy shared by the CLI and the desktop client (#76 step 4: H7, M4, L1, M2).
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { EngineImpl, IncompatibleTargetError, UpdateFailedError } from '../engine'
import { ItemCatalog } from './helpers/item-catalog'
import type { MCPItem, ProviderItem, RegistryJson } from '@as/types'

process.env['AS_CLAUDE_BIN'] = ''
process.env['AS_CODEX_BIN'] = ''

const publisher = { id: 'p1', slug: 'pub', name: 'Pub', avatarUrl: '', tier: 'community' as const }
const base = {
  id: 'i1', name: 'Test', description: 'desc', version: '1.0.0', publisher,
  compatibleWith: ['claude' as const, 'codex' as const],
  tags: [], downloads: 0, rating: 0, status: 'published' as const,
  createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  installHook: { steps: [] },
}

const plainMcp: MCPItem = { ...base, slug: 'plain-mcp', category: 'mcp', transport: 'stdio', serverCommand: 'npx plain', configSchema: { type: 'object' } }
const tokenMcp: MCPItem = {
  ...base, slug: 'token-mcp', category: 'mcp', transport: 'stdio', serverCommand: 'npx token-server',
  configSchema: { type: 'object', properties: { token: { type: 'string', 'x-env': 'TOKEN' } }, required: ['token'] },
}
const claudeOnlyMcp: MCPItem = { ...plainMcp, slug: 'claude-only', compatibleWith: ['claude'] }
const provider: ProviderItem = {
  ...base, slug: 'test-provider', category: 'provider',
  configSchema: { type: 'object', properties: { apiKey: { type: 'string' } } }, supportedModels: [],
}

let aasHome: string
let claudeDir: string
let codexDir: string
let engine: EngineImpl
const origFetch = globalThis.fetch

function serve(...items: Array<MCPItem | ProviderItem>) {
  globalThis.fetch = (async (url: string) => {
    const item = items.find(i => String(url).includes(`/api/items/${i.slug}`))
    if (item) return new Response(JSON.stringify({ item }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (String(url).includes('/install')) return new Response('{}', { status: 200 })
    throw new Error(`Unmocked URL: ${url}`)
  }) as typeof fetch
}

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-policy-home-')
  claudeDir = await mkdtemp('/tmp/as-policy-claude-')
  codexDir = await mkdtemp('/tmp/as-policy-codex-')
  engine = new EngineImpl({ aasHome, claudeConfigDir: claudeDir, codexConfigDir: codexDir }, 'http://localhost:3000', { catalog: new ItemCatalog('http://localhost:3000') })
})

afterEach(async () => {
  globalThis.fetch = origFetch
  for (const d of [aasHome, claudeDir, codexDir]) await rm(d, { recursive: true, force: true })
})

const claudeJson = () => join(claudeDir, '.claude.json')
const codexToml = () => join(codexDir, 'config.toml')
const readRegistry = async (): Promise<RegistryJson> => JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
const entryOf = async (slug: string) => (await readRegistry()).installed.find(e => e.slug === slug)

async function patchRegistry(slug: string, patch: Record<string, unknown>) {
  const reg = await readRegistry()
  reg.installed = reg.installed.map(e => (e.slug === slug ? { ...e, ...patch } : e))
  await writeFile(join(aasHome, 'registry.json'), JSON.stringify(reg, null, 2))
}

// ── M4: enable checks compatibleWith ─────────────────────────────────────────

test('enable refuses a tool the item is not compatible with and writes nothing', async () => {
  serve(claudeOnlyMcp)
  await engine.install('claude-only')
  const err = await engine.enable('claude-only', 'codex').catch(e => e)
  expect(err).toBeInstanceOf(IncompatibleTargetError)
  expect(String(err.message)).toContain('codex')
  expect(existsSync(codexToml())).toBe(false)
  expect((await entryOf('claude-only'))!.enabledFor.codex).toBeUndefined()
})

// ── M4: uninstall cleans every tool it actually enabled ──────────────────────

test('uninstall removes a tool entry enabled outside compatibleWith, with its registry entry and record', async () => {
  serve(plainMcp)
  await engine.install('plain-mcp')
  await engine.enable('plain-mcp', 'codex')
  // The catalog later dropped Codex; the entry Agent Store wrote is still there.
  await patchRegistry('plain-mcp', { compatibleWith: ['claude'] })
  expect(await readFile(codexToml(), 'utf-8')).toContain('[mcp_servers.plain-mcp]')

  await engine.uninstall('plain-mcp')
  expect(await readFile(codexToml(), 'utf-8')).not.toContain('plain-mcp')
  expect(await entryOf('plain-mcp')).toBeUndefined()
  expect(existsSync(join(aasHome, 'mcps', 'plain-mcp'))).toBe(false)
})

test('uninstall removes an entry recorded in targets.json even when the registry missed the enable', async () => {
  serve(plainMcp)
  await engine.install('plain-mcp')
  await engine.enable('plain-mcp', 'claude')
  // An enable that stopped after writing the tool config but before the registry update.
  await patchRegistry('plain-mcp', { enabledFor: {} })

  await engine.uninstall('plain-mcp')
  const cfg = JSON.parse(await readFile(claudeJson(), 'utf-8'))
  expect(cfg.mcpServers?.['plain-mcp']).toBeUndefined()
  expect(await entryOf('plain-mcp')).toBeUndefined()
})

// ── shared install policy ────────────────────────────────────────────────────

test('installAndEnable of an MCP that needs config installs it and enables nothing', async () => {
  serve(tokenMcp)
  const out = await engine.installAndEnable('token-mcp')
  expect(out.slug).toBe('token-mcp')
  expect(out.category).toBe('mcp')
  expect(out.enabled).toEqual([])
  expect(out.notEnabled.map(n => [n.target, n.reason])).toEqual([['claude', 'needs-config'], ['codex', 'needs-config']])
  expect(out.notEnabled[0].message).toContain('config token-mcp')
  expect((await entryOf('token-mcp'))!.enabledFor).toEqual({})
  expect(existsSync(claudeJson())).toBe(false)
  expect(existsSync(codexToml())).toBe(false)
})

test('installAndEnable of a ready MCP enables it for every compatible tool', async () => {
  serve(plainMcp)
  const out = await engine.installAndEnable('plain-mcp')
  expect(out.enabled).toEqual(['claude', 'codex'])
  expect(out.notEnabled).toEqual([])
  expect(JSON.parse(await readFile(claudeJson(), 'utf-8')).mcpServers['plain-mcp']).toBeDefined()
  expect(await readFile(codexToml(), 'utf-8')).toContain('[mcp_servers.plain-mcp]')
})

test('installAndEnable with a target enables only that tool', async () => {
  serve(plainMcp)
  const out = await engine.installAndEnable('plain-mcp', { target: 'claude' })
  expect(out.enabled).toEqual(['claude'])
  expect(existsSync(codexToml())).toBe(false)
})

test('installAndEnable skips tools the item does not support', async () => {
  serve(claudeOnlyMcp)
  const out = await engine.installAndEnable('claude-only')
  expect(out.enabled).toEqual(['claude'])
  expect(out.notEnabled).toEqual([])
  expect(existsSync(codexToml())).toBe(false)
})

test('installAndEnable of a provider without a key reports no-key for each tool', async () => {
  serve(provider)
  const out = await engine.installAndEnable('test-provider')
  expect(out.enabled).toEqual([])
  expect(out.notEnabled.map(n => n.reason)).toEqual(['no-key', 'no-key'])
})

test('getTargetStatus reports compatibility, enabled state and what blocks enabling', async () => {
  serve(tokenMcp, claudeOnlyMcp)
  await engine.install('token-mcp')
  let status = await engine.getTargetStatus('token-mcp')
  expect(status.map(s => [s.target, s.compatible, s.enabled, s.blocker?.reason])).toEqual([
    ['claude', true, false, 'needs-config'],
    ['codex', true, false, 'needs-config'],
  ])
  await engine.setConfig('token-mcp', { token: 't' })
  await engine.enable('token-mcp', 'claude')
  status = await engine.getTargetStatus('token-mcp')
  expect(status.map(s => [s.target, s.enabled, s.blocker?.reason])).toEqual([['claude', true, undefined], ['codex', false, undefined]])

  await engine.install('claude-only')
  const other = await engine.getTargetStatus('claude-only')
  expect(other[1]).toMatchObject({ target: 'codex', compatible: false, blocker: { reason: 'incompatible' } })
})

// ── M2: update syncs before it records the new version ───────────────────────

test('a failed update throws and leaves the registry, the item files and the tool config as they were', async () => {
  serve(plainMcp)
  await engine.install('plain-mcp')
  await engine.enable('plain-mcp', 'claude')
  // The user edited our entry; the resync of the new version must refuse it.
  const cfg = JSON.parse(await readFile(claudeJson(), 'utf-8'))
  cfg.mcpServers['plain-mcp'].args = ['edited']
  await writeFile(claudeJson(), JSON.stringify(cfg, null, 2))
  const claudeBefore = await readFile(claudeJson(), 'utf-8')
  const manifestBefore = await readFile(join(aasHome, 'mcps', 'plain-mcp', 'manifest.json'), 'utf-8')

  serve({ ...plainMcp, version: '2.0.0', serverCommand: 'npx plain@2' })
  const err = await engine.update('plain-mcp').catch(e => e)
  expect(err).toBeInstanceOf(UpdateFailedError)
  expect(err.failures.map((f: { slug: string }) => f.slug)).toEqual(['plain-mcp'])
  expect(err.message).toContain('outside Agent Store')
  expect((await entryOf('plain-mcp'))!.version).toBe('1.0.0')
  expect(await readFile(join(aasHome, 'mcps', 'plain-mcp', 'manifest.json'), 'utf-8')).toBe(manifestBefore)
  expect(await readFile(claudeJson(), 'utf-8')).toBe(claudeBefore)
})

test('update records the new version only after the tools took it, and keeps going past a failure', async () => {
  serve(plainMcp, claudeOnlyMcp)
  await engine.install('plain-mcp')
  await engine.enable('plain-mcp', 'claude')
  await engine.install('claude-only')
  await engine.enable('claude-only', 'claude')
  const cfg = JSON.parse(await readFile(claudeJson(), 'utf-8'))
  cfg.mcpServers['claude-only'].args = ['edited']
  await writeFile(claudeJson(), JSON.stringify(cfg, null, 2))

  serve({ ...plainMcp, version: '2.0.0', serverCommand: 'npx plain@2' }, { ...claudeOnlyMcp, version: '2.0.0', serverCommand: 'npx other@2' })
  const err = await engine.update().catch(e => e)
  expect(err).toBeInstanceOf(UpdateFailedError)
  expect(err.updated).toEqual([{ slug: 'plain-mcp', fromVersion: '1.0.0', toVersion: '2.0.0' }])
  expect(err.failures.map((f: { slug: string }) => f.slug)).toEqual(['claude-only'])
  expect((await entryOf('plain-mcp'))!.version).toBe('2.0.0')
  expect((await entryOf('claude-only'))!.version).toBe('1.0.0')
  const after = JSON.parse(await readFile(claudeJson(), 'utf-8'))
  expect(after.mcpServers['plain-mcp'].args).toEqual(['plain@2'])
})
