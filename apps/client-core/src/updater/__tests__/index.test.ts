import { test, expect } from 'bun:test'
import { checkUpdates } from '../index'
import type { RegistryJson, Item, InstalledItem, ResourceKind } from '@as/types'
import type { Catalog } from '../../catalog'

const installedEntry: InstalledItem = {
  slug: 'openai-provider',
  category: 'provider',
  version: '1.0.0',
  installedAt: '2026-06-18T00:00:00Z',
  updatedAt: '2026-06-18T00:00:00Z',
  compatibleWith: ['claude'],
  enabledFor: { claude: true },
}

const registry: RegistryJson = { installed: [installedEntry] }

function makeCatalog(version: string | null, asked: Array<{ ref: string; kind?: ResourceKind }> = []): Catalog {
  return {
    resolveItem: async (ref: string, options?: { kind?: ResourceKind }) => {
      asked.push({ ref, kind: options?.kind })
      if (version === null) throw new Error('Not in the catalog')
      return { item: { slug: 'openai-provider', version } as unknown as Item, resourceId: null, longSlug: null }
    },
  } as unknown as Catalog
}

test('checkUpdates returns UpdateAvailable when the catalog version differs', async () => {
  const updates = await checkUpdates(registry, makeCatalog('2.0.0'))
  expect(updates).toEqual([{ slug: 'openai-provider', currentVersion: '1.0.0', latestVersion: '2.0.0' }])
})

test('checkUpdates returns nothing when already up to date', async () => {
  expect(await checkUpdates(registry, makeCatalog('1.0.0'))).toHaveLength(0)
})

test('checkUpdates skips entries the catalog no longer resolves', async () => {
  expect(await checkUpdates(registry, makeCatalog(null))).toHaveLength(0)
})

test('checkUpdates looks an entry up by its catalog id when it has one, else by slug, within its kind', async () => {
  const asked: Array<{ ref: string; kind?: ResourceKind }> = []
  const withId: RegistryJson = { installed: [installedEntry, { ...installedEntry, slug: 'b', resourceId: 'builtin:b' }] }
  await checkUpdates(withId, makeCatalog('1.0.0', asked))
  expect(asked).toEqual([{ ref: 'openai-provider', kind: 'provider' }, { ref: 'builtin:b', kind: 'provider' }])
})

test('checkUpdates filters by slug and skips duplicated providers', async () => {
  const two: RegistryJson = { installed: [installedEntry, { ...installedEntry, slug: 'copy', parentSlug: 'openai-provider' }] }
  expect(await checkUpdates(two, makeCatalog('2.0.0'), ['copy'])).toHaveLength(0)
})
