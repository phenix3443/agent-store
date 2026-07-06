import { test, expect, afterEach } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { catalogCachePath, readCatalogCache, writeCatalogCache } from '../catalog-cache'
import type { SkillItem } from '@as/types'

const publisher = { id: 'p1', slug: 'pub', name: 'Pub', avatarUrl: '', tier: 'community' as const }
const fakeItem: SkillItem = {
  id: 'i1', slug: 'test-skill', name: 'Test', description: 'desc',
 category: 'skill',
  version: '1.0.0', publisher, compatibleWith: ['claude'], tags: ['ai'],
  downloads: 0, rating: 0, status: 'published', installHook: { steps: [] },
  createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  contentUrl: 'https://s.com',
}

let aasHome: string | undefined

afterEach(async () => {
  if (aasHome) await rm(aasHome, { recursive: true, force: true })
  aasHome = undefined
})

test('catalogCachePath joins aasHome with catalog-cache.json', () => {
  expect(catalogCachePath('/tmp/some-home')).toBe(join('/tmp/some-home', 'catalog-cache.json'))
})

test('writeCatalogCache then readCatalogCache round-trips the items', async () => {
  aasHome = await mkdtemp('/tmp/as-catalog-cache-')
  await writeCatalogCache(aasHome, [fakeItem])

  const cache = await readCatalogCache(aasHome)

  expect(cache?.items).toHaveLength(1)
  expect(cache?.items[0]?.slug).toBe('test-skill')
  expect(typeof cache?.fetchedAt).toBe('string')
})

test('readCatalogCache returns null when the cache file is missing', async () => {
  aasHome = await mkdtemp('/tmp/as-catalog-cache-')

  const cache = await readCatalogCache(aasHome)

  expect(cache).toBeNull()
})

test('readCatalogCache returns null for a corrupt (non-JSON) cache file', async () => {
  aasHome = await mkdtemp('/tmp/as-catalog-cache-')
  await mkdir(aasHome, { recursive: true })
  await writeFile(catalogCachePath(aasHome), 'not valid json{')

  const cache = await readCatalogCache(aasHome)

  expect(cache).toBeNull()
})

test('readCatalogCache returns null when the parsed shape has no items array', async () => {
  aasHome = await mkdtemp('/tmp/as-catalog-cache-')
  await mkdir(aasHome, { recursive: true })
  await writeFile(catalogCachePath(aasHome), JSON.stringify({ fetchedAt: 'x' }))

  const cache = await readCatalogCache(aasHome)

  expect(cache).toBeNull()
})
