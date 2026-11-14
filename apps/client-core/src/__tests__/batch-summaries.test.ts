import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Item, MCPItem, SkillItem } from '@as/types'
import { EngineImpl } from '../engine'
import { ItemCatalog } from './helpers/item-catalog'
import { writeMcpTargets } from '../config/mcp-targets'

// The safe file-edit path, without an installed claude or codex CLI.
process.env['AS_CLAUDE_BIN'] = ''
process.env['AS_CODEX_BIN'] = ''

const base = {
  id: 'x', name: 'x', description: 'x', version: '1.0.0', tags: [], downloads: 0, status: 'published' as const,
  publisher: { id: 'p', slug: 'p', name: 'p', avatarUrl: '', tier: 'community' as const },
  installHook: { steps: [] }, createdAt: '', updatedAt: '', compatibleWith: ['claude', 'codex'] as Array<'claude' | 'codex'>,
}
const mcp = (slug: string): MCPItem => ({ ...base, slug, category: 'mcp', transport: 'stdio', serverCommand: `./${slug}`, configSchema: { type: 'object' } })
const skill: SkillItem = { ...base, slug: 'review', category: 'skill', contentUrl: 'https://raw.test/SKILL.md' }

let root: string
let paths: { aasHome: string; claudeConfigDir: string; claudeJsonPath: string; codexConfigDir: string; legacyHome: string }
let engine: EngineImpl
const origFetch = globalThis.fetch

beforeEach(async () => {
  root = await mkdtemp('/tmp/as-batch-')
  paths = {
    aasHome: join(root, 'as'), claudeConfigDir: join(root, 'claude'), claudeJsonPath: join(root, 'claude', '.claude.json'),
    codexConfigDir: join(root, 'codex'), legacyHome: join(root, 'legacy'),
  }
  const items: Item[] = [mcp('one'), mcp('two'), skill]
  engine = new EngineImpl(paths, 'http://store.test', { catalog: new ItemCatalog(() => items) })
  globalThis.fetch = (async () => new Response('---\nname: review\ndescription: d\n---\n')) as unknown as typeof fetch
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(root, { recursive: true, force: true })
})

const claudeServers = async () => JSON.parse(await readFile(paths.claudeJsonPath, 'utf-8')).mcpServers ?? {}

test('batch runs every step and reports each one; a failed step does not stop the rest', async () => {
  await engine.install('one')
  await engine.install('two')
  const out = await engine.batch([
    { action: 'enable', slug: 'one', target: 'claude' },
    { action: 'enable', slug: 'missing', target: 'claude' },
    { action: 'enable', slug: 'two', target: 'claude' },
  ])
  expect(out.map(o => o.ok)).toEqual([true, false, true])
  expect(out[1]).toMatchObject({ action: 'enable', slug: 'missing', target: 'claude', ok: false })
  expect(!out[1].ok && out[1].error.message).toContain('Item not installed')
  expect(Object.keys(await claudeServers()).sort()).toEqual(['one', 'two'])
  expect((await engine.info('two')).enabledFor.claude).toBe(true)
})

test('batch reports the engine error code and fields of a refused step', async () => {
  await engine.install('one')
  await engine.install('two')
  await mkdir(paths.claudeConfigDir, { recursive: true })
  await writeFile(paths.claudeJsonPath, JSON.stringify({ mcpServers: { two: { command: 'mine' } } }))
  const out = await engine.batch([
    { action: 'enable', slug: 'one', target: 'claude' },
    { action: 'enable', slug: 'two', target: 'claude' },
  ])
  expect(out[0].ok).toBe(true)
  expect(out[1].ok).toBe(false)
  if (!out[1].ok) expect(out[1].error).toMatchObject({ code: 'McpConflictError', tool: 'claude' })
  expect((await claudeServers()).two).toEqual({ command: 'mine' })
})

test('batch disables and uninstalls', async () => {
  await engine.install('one')
  await engine.install('two')
  await engine.enable('one', 'claude')
  await engine.enable('two', 'claude')
  const out = await engine.batch([
    { action: 'disable', slug: 'one', target: 'claude' },
    { action: 'uninstall', slug: 'two' },
  ])
  expect(out.every(o => o.ok)).toBe(true)
  expect(await claudeServers()).toEqual({})
  expect((await engine.list()).map(e => e.slug)).toEqual(['one'])
  expect((await engine.info('one')).enabledFor.claude).toBe(false)
})

test('info gives the library directory, and for MCP the tools whose own entry was taken over', async () => {
  await engine.install('one')
  const dir = join(paths.aasHome, 'mcps', 'one')
  expect((await engine.info('one')).dir).toBe(dir)
  expect((await engine.info('one')).replacedFor).toEqual([])
  await writeMcpTargets(dir, { claude: { name: 'one', written: { command: './one' }, previous: { command: 'mine' } } })
  expect((await engine.info('one')).replacedFor).toEqual(['claude'])
})

test('replace without the tool CLI is refused with reason no-cli and changes nothing', async () => {
  await engine.install('one')
  await mkdir(paths.claudeConfigDir, { recursive: true })
  await writeFile(paths.claudeJsonPath, JSON.stringify({ mcpServers: { one: { command: 'mine' } } }))
  const err = await engine.enable('one', 'claude', { replace: true }).catch(e => e)
  expect(err.name).toBe('McpNotRestorableError')
  expect(err.reason).toBe('no-cli')
  expect(err.tool).toBe('claude')
  expect((await claudeServers()).one).toEqual({ command: 'mine' })
})

test('projectSummaries counts what the agents use and lists what Agent Store installed', async () => {
  const proj = join(root, 'repo')
  await mkdir(join(proj, '.claude/skills/own'), { recursive: true })
  await writeFile(join(proj, '.claude/skills/own/SKILL.md'), '---\nname: own\ndescription: d\n---\n')
  const p = await engine.addProject(proj)
  await engine.installToProject(p.id, 'review')
  const [s] = await engine.projectSummaries()
  expect(s).toMatchObject({ id: p.id, exists: true, skills: 2, mcps: 0 })
  expect(s.installed.map(i => [i.kind, i.slug, i.name])).toEqual([['skill', 'review', 'review']])

  await rename(proj, join(root, 'moved'))
  const [gone] = await engine.projectSummaries()
  expect(gone).toMatchObject({ exists: false, skills: null, mcps: null })
  expect(gone.installed.map(i => i.slug)).toEqual(['review'])
})
