import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { EngineImpl } from '../engine'
import { writeCatalogCache, catalogCachePath } from '../catalog-cache'
import type { SkillItem } from '@as/types'

const publisher = { id: 'p1', slug: 'pub', name: 'Pub', avatarUrl: '', tier: 'community' as const }
function makeItem(overrides: Partial<SkillItem>): SkillItem {
  return {
    id: 'i1', slug: 'item', name: 'Item', description: 'desc',
 category: 'skill',
    version: '1.0.0', publisher, compatibleWith: ['claude'], tags: [],
    downloads: 0, rating: 0, status: 'published', installHook: { steps: [] },
    createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
    contentUrl: 'https://s.com',
    ...overrides,
  }
}

const taggedItem = makeItem({ slug: 'tagged', name: 'Tagged Item', tags: ['weather'] })
const plainItem = makeItem({ slug: 'plain', name: 'Plain Item', tags: [] })

let aasHome: string
let claudeDir: string
let codexDir: string
let engine: EngineImpl
const origFetch = globalThis.fetch

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-search-home-')
  claudeDir = await mkdtemp('/tmp/as-search-claude-')
  codexDir = await mkdtemp('/tmp/as-search-codex-')
  engine = new EngineImpl(
    { aasHome, claudeConfigDir: claudeDir, codexConfigDir: codexDir },
    'http://localhost:3000'
  )
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(aasHome, { recursive: true, force: true })
  await rm(claudeDir, { recursive: true, force: true })
  await rm(codexDir, { recursive: true, force: true })
})

test('success path: writes the catalog cache and returns locally-filtered results (query matches a tag)', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ items: [taggedItem, plainItem] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch

  const results = await engine.search('weather')

  expect(results).toHaveLength(1)
  expect(results[0]?.slug).toBe('tagged')

  const cache = JSON.parse(await readFile(catalogCachePath(aasHome), 'utf-8'))
  expect(cache.items).toHaveLength(2)
})

test('error path with a pre-seeded cache: returns the cached items filtered locally (API-down resilience)', async () => {
  await writeCatalogCache(aasHome, [taggedItem, plainItem])
  globalThis.fetch = (async () => {
    throw new Error('network down')
  }) as unknown as typeof fetch

  const results = await engine.search('weather')

  expect(results).toHaveLength(1)
  expect(results[0]?.slug).toBe('tagged')
})

test('error path with no cache: returns an empty array', async () => {
  globalThis.fetch = (async () => {
    throw new Error('network down')
  }) as unknown as typeof fetch

  const results = await engine.search('')

  expect(results).toEqual([])
})
