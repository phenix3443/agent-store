import { test, expect, afterEach } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { catalogCachePath, readCatalogCache, writeCatalogCache } from '../catalog-cache'
import type { CatalogResource } from '@as/types'

const row: CatalogResource = {
  id: 'github:o/r/test-skill', kind: 'skill', name: 'test-skill', description: 'desc', author: null,
  version: 'abc', homepageUrl: null, installs: null, verified: false, tags: ['ai'], transports: [],
  origin: {
    site: 'github', upstreamId: 'o/r/test-skill', url: null, upstreamVersion: null, upstreamUpdatedAt: null,
    syncedAt: '2026-11-12T00:00:00Z', unavailableAt: null, unavailableReason: null,
  },
  slug: 'r-test-skill',
}

let aasHome: string | undefined

afterEach(async () => {
  if (aasHome) await rm(aasHome, { recursive: true, force: true })
  aasHome = undefined
})

test('catalogCachePath joins aasHome with catalog-cache.json', () => {
  expect(catalogCachePath('/tmp/some-home')).toBe(join('/tmp/some-home', 'catalog-cache.json'))
})

test('each page round-trips on its own', async () => {
  aasHome = await mkdtemp('/tmp/as-catalog-cache-')
  await writeCatalogCache(aasHome, 'all', [row])
  await writeCatalogCache(aasHome, 'mcp', [])
  expect((await readCatalogCache(aasHome, 'all'))?.map(r => r.slug)).toEqual(['r-test-skill'])
  expect(await readCatalogCache(aasHome, 'mcp')).toEqual([])
  expect(await readCatalogCache(aasHome, 'skill')).toBeNull()
})

test('a missing file, a cache from before /api/resources and bad JSON all read as no cache', async () => {
  aasHome = await mkdtemp('/tmp/as-catalog-cache-')
  expect(await readCatalogCache(aasHome, 'all')).toBeNull()
  await writeFile(catalogCachePath(aasHome), JSON.stringify({ items: [{ slug: 'x' }], fetchedAt: 'now' }))
  expect(await readCatalogCache(aasHome, 'all')).toBeNull()
  await writeFile(catalogCachePath(aasHome), '{not json')
  expect(await readCatalogCache(aasHome, 'all')).toBeNull()
})
