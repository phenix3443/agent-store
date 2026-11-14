import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Item, MCPItem, SkillItem } from '@as/types'
import { EngineImpl } from '../../engine'
import { runDoctor } from '../../doctor'
import { ItemCatalog } from '../../__tests__/helpers/item-catalog'
import { writeMcpTargets } from '../../config/mcp-targets'
import { writeRegistry } from '../../registry/index'

process.env['AS_CLAUDE_BIN'] = ''
process.env['AS_CODEX_BIN'] = ''

const base = {
  id: 'x', name: 'x', description: 'x', version: '1.0.0', tags: [], downloads: 0, status: 'published' as const,
  publisher: { id: 'p', slug: 'p', name: 'p', avatarUrl: '', tier: 'community' as const },
  installHook: { steps: [] }, createdAt: '', updatedAt: '', compatibleWith: ['claude', 'codex'] as Array<'claude' | 'codex'>,
}
const skill: SkillItem = { ...base, slug: 'review', category: 'skill', contentUrl: 'https://raw.test/SKILL.md' }
const keyed: MCPItem = {
  ...base, slug: 'keyed', category: 'mcp', transport: 'stdio', templated: true, serverCommand: 'npx keyed', command: 'npx', args: ['keyed'],
  configSchema: { type: 'object', properties: { API_KEY: { type: 'string', 'x-env': 'API_KEY', 'x-secret': true } }, required: ['API_KEY'] },
}

let root: string
let proj: string
let paths: { aasHome: string; claudeConfigDir: string; claudeJsonPath: string; codexConfigDir: string; legacyHome: string }
let engine: EngineImpl
const origFetch = globalThis.fetch

beforeEach(async () => {
  root = await mkdtemp('/tmp/as-doctor-projects-')
  proj = join(root, 'repo')
  await mkdir(join(proj, '.git'), { recursive: true })
  paths = {
    aasHome: join(root, 'as'), claudeConfigDir: join(root, 'claude'), claudeJsonPath: join(root, 'claude', '.claude.json'),
    codexConfigDir: join(root, 'codex'), legacyHome: join(root, 'legacy'),
  }
  const items: Item[] = [skill, keyed]
  engine = new EngineImpl(paths, 'http://store.test', { catalog: new ItemCatalog(() => items) })
  globalThis.fetch = (async () => new Response('---\nname: review\ndescription: d\n---\n')) as unknown as typeof fetch
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(root, { recursive: true, force: true })
})

const codes = async () => (await runDoctor(paths)).map(f => f.code).sort()

test('doctor reports missing keys, an untrusted Codex project and edited copies, as `projects show` does', async () => {
  const p = await engine.addProject(proj)
  await engine.installToProject(p.id, 'keyed')
  await engine.installToProject(p.id, 'review')
  expect(await codes()).toEqual(['project-codex-untrusted', 'project-env-missing'])
  await engine.setProjectEnv(p.id, 'API_KEY', 'v')
  await mkdir(paths.codexConfigDir, { recursive: true })
  await writeFile(join(paths.codexConfigDir, 'config.toml'), `[projects."${proj}"]\ntrust_level = "trusted"\n`)
  expect(await codes()).toEqual([])
  await writeFile(join(proj, '.claude/skills/review/SKILL.md'), 'edited')
  await rm(join(proj, '.agents/skills/review'), { recursive: true })
  expect(await codes()).toEqual(['project-item-missing', 'project-item-modified'])
})

test('doctor reports a registered project whose directory is gone', async () => {
  await engine.addProject(proj)
  await rename(proj, join(root, 'elsewhere'))
  expect(await codes()).toEqual(['project-missing'])
})

test('a user MCP overridden in a registered trusted Codex project is reported as shadowed', async () => {
  const p = await engine.addProject(proj)
  await mkdir(join(proj, '.codex'), { recursive: true })
  await writeFile(join(proj, '.codex/config.toml'), '[mcp_servers.ctx]\ncommand = "project"\n')
  await mkdir(paths.codexConfigDir, { recursive: true })
  const written = { command: 'user' }
  await writeFile(join(paths.codexConfigDir, 'config.toml'), `[mcp_servers.ctx]\ncommand = "user"\n\n[projects."${proj}"]\ntrust_level = "trusted"\n`)
  await writeRegistry(paths.aasHome, { installed: [{ slug: 'ctx', category: 'mcp', version: '1', installedAt: '', updatedAt: '', compatibleWith: ['codex'], enabledFor: { codex: true } }] })
  await writeMcpTargets(join(paths.aasHome, 'mcps', 'ctx'), { codex: { name: 'ctx', written, previous: null } })
  const findings = await runDoctor(paths)
  expect(findings.find(f => f.code === 'mcp-shadowed')?.message).toContain(join(proj, '.codex/config.toml'))
  expect(p.id).toBeTruthy()
})
