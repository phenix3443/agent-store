// Every slug that ends up in a path goes through one check (#76 M5).
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, readdir, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { EngineImpl } from '../engine'
import { assertSafeSlug, InvalidSlugError, itemDir } from '../paths'
import { claudeSkillLink } from '../skills/claude-link'
import type { MCPItem } from '@as/types'

const BAD = ['', '.', '..', '../x', 'a/b', 'a\\b', '/abs', '.hidden', 'x'.repeat(129), 'a\0b']

test('unsafe slugs are refused, ordinary ones pass', () => {
  for (const slug of BAD) expect(() => assertSafeSlug(slug)).toThrow(InvalidSlugError)
  for (const slug of ['github-mcp', 'gpt-4o', 'local.pkg', 'my_provider-copy-2', 'A1']) expect(assertSafeSlug(slug)).toBe(slug)
})

test('itemDir and the Claude skill link refuse an unsafe slug', () => {
  expect(() => itemDir('/h', 'mcp', '../../etc')).toThrow(InvalidSlugError)
  expect(() => claudeSkillLink('/c', '../x')).toThrow(InvalidSlugError)
  expect(itemDir('/h', 'mcp', 'ok')).toBe('/h/mcps/ok')
})

let aasHome: string
let engine: EngineImpl
const origFetch = globalThis.fetch
let fetched: string[]

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-slug-')
  fetched = []
  engine = new EngineImpl({ aasHome, claudeConfigDir: join(aasHome, 'claude'), codexConfigDir: join(aasHome, 'codex') }, 'http://localhost:3000')
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(aasHome, { recursive: true, force: true })
})

function serve(item: MCPItem) {
  globalThis.fetch = (async (url: string) => {
    fetched.push(String(url))
    return new Response(JSON.stringify({ item }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
}

const item: MCPItem = {
  id: 'i1', slug: 'ok-mcp', name: 'T', description: 'd', version: '1.0.0', category: 'mcp',
  publisher: { id: 'p', slug: 'p', name: 'P', avatarUrl: '', tier: 'community' }, compatibleWith: ['claude'],
  tags: [], downloads: 0, rating: 0, status: 'published', createdAt: '', updatedAt: '',
  installHook: { steps: [] }, transport: 'stdio', serverCommand: 'npx x', configSchema: {},
}

test('install refuses an unsafe slug before asking the store', async () => {
  serve(item)
  const err = await engine.install('../../escape').catch(e => e)
  expect(err).toBeInstanceOf(InvalidSlugError)
  expect(err.reason).toBe('invalid-slug')
  expect(fetched).toEqual([])
  expect(await readdir(aasHome)).toEqual([])
})

test('a skill whose catalog slug differs from the one asked for is refused', async () => {
  serve({ ...item, category: 'skill', slug: '../other', compatibleWith: ['claude', 'codex'] } as unknown as MCPItem)
  await expect(engine.install('ok-skill')).rejects.toThrow('nothing was installed')
  expect(existsSync(join(aasHome, 'registry.json'))).toBe(false)
  expect(existsSync(join(aasHome, 'skills'))).toBe(false)
})

test('a registry entry with an unsafe slug cannot reach the file system', async () => {
  await writeFile(join(aasHome, 'registry.json'), JSON.stringify({ installed: [{
    slug: '../../victim', category: 'mcp', version: '1', installedAt: '', updatedAt: '',
    compatibleWith: ['claude'], enabledFor: { claude: true },
  }] }))
  await expect(engine.enable('../../victim', 'claude')).rejects.toBeInstanceOf(InvalidSlugError)
  await expect(engine.uninstall('../../victim')).rejects.toBeInstanceOf(InvalidSlugError)
  await expect(engine.info('../../victim')).rejects.toBeInstanceOf(InvalidSlugError)
})
