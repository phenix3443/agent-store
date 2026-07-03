import { test, expect } from 'bun:test'
import {
  matchesCategoryFilter, matchesText, enrichInstalled,
  filterInstalledByListFilter, filterRecommendedByListFilter,
  showInstalledSection, showRecommendedSection,
} from '../resources'
import type { InstalledItem, Item, ItemDetail } from '@aas/types'

const publisher = { id: 'p', slug: 'anthropic', name: 'anthropic', avatarUrl: '', tier: 'official' as const }

const installedItem: InstalledItem = {
  slug: 'filesystem', category: 'mcp', version: '0.8.1',
  installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  compatibleWith: ['claude', 'codex'], enabledFor: { claude: true, codex: false },
}

const itemDetail: ItemDetail = {
  ...installedItem,
  name: 'filesystem', description: '读写本地文件系统', readmeUrl: '', icon: '',
  publisher, tags: ['fs'], downloads: 388000,
}

const catalogItem: Item = {
  id: 'i1', slug: 'context7', name: 'context7', description: '文档上下文',
  readmeUrl: '', icon: '', category: 'mcp', version: '1.0.0', publisher,
  compatibleWith: ['claude'], tags: [], downloads: 118000, rating: 4.7,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
  configSchema: {}, transport: 'stdio', serverCommand: './server',
}

test('matchesCategoryFilter: "all" matches everything, others match exactly', () => {
  expect(matchesCategoryFilter('mcp', 'all')).toBe(true)
  expect(matchesCategoryFilter('mcp', 'mcp')).toBe(true)
  expect(matchesCategoryFilter('mcp', 'provider')).toBe(false)
})

test('matchesText: empty query matches everything, otherwise matches name or description case-insensitively', () => {
  expect(matchesText('filesystem', '读写本地文件系统', '')).toBe(true)
  expect(matchesText('filesystem', '读写本地文件系统', 'FILE')).toBe(true)
  expect(matchesText('filesystem', '读写本地文件系统', '文件')).toBe(true)
  expect(matchesText('filesystem', '读写本地文件系统', 'nope')).toBe(false)
})

test('enrichInstalled: merges detail fields onto the installed entry with rating defaulted to 0', () => {
  const enriched = enrichInstalled(installedItem, itemDetail)
  expect(enriched.slug).toBe('filesystem')
  expect(enriched.name).toBe('filesystem')
  expect(enriched.description).toBe('读写本地文件系统')
  expect(enriched.downloads).toBe(388000)
  expect(enriched.rating).toBe(0)
  expect(enriched.enabledFor).toEqual({ claude: true, codex: false })
})

test('filterInstalledByListFilter: "enabled"/"disabled" filter by the active agent app', () => {
  const enriched = [enrichInstalled(installedItem, itemDetail)]
  expect(filterInstalledByListFilter(enriched, 'enabled', 'claude', new Set()).length).toBe(1)
  expect(filterInstalledByListFilter(enriched, 'enabled', 'codex', new Set()).length).toBe(0)
  expect(filterInstalledByListFilter(enriched, 'disabled', 'codex', new Set()).length).toBe(1)
})

test('filterInstalledByListFilter: "favorites" filters by the favorite set', () => {
  const enriched = [enrichInstalled(installedItem, itemDetail)]
  expect(filterInstalledByListFilter(enriched, 'favorites', 'claude', new Set()).length).toBe(0)
  expect(filterInstalledByListFilter(enriched, 'favorites', 'claude', new Set(['filesystem'])).length).toBe(1)
})

test('filterInstalledByListFilter: "all" and other filters pass everything through', () => {
  const enriched = [enrichInstalled(installedItem, itemDetail)]
  expect(filterInstalledByListFilter(enriched, 'all', 'claude', new Set()).length).toBe(1)
  expect(filterInstalledByListFilter(enriched, 'popular', 'claude', new Set()).length).toBe(1)
})

test('filterRecommendedByListFilter: "popular" sorts by downloads descending', () => {
  const low: Item = { ...catalogItem, slug: 'low', downloads: 10 }
  const high: Item = { ...catalogItem, slug: 'high', downloads: 999 }
  const sorted = filterRecommendedByListFilter([low, high], 'popular', new Set())
  expect(sorted.map(i => i.slug)).toEqual(['high', 'low'])
})

test('filterRecommendedByListFilter: "recent" sorts by createdAt descending', () => {
  const older: Item = { ...catalogItem, slug: 'older', createdAt: '2026-01-01T00:00:00Z' }
  const newer: Item = { ...catalogItem, slug: 'newer', createdAt: '2026-06-01T00:00:00Z' }
  const sorted = filterRecommendedByListFilter([older, newer], 'recent', new Set())
  expect(sorted.map(i => i.slug)).toEqual(['newer', 'older'])
})

test('filterRecommendedByListFilter: "favorites" filters by the favorite set', () => {
  expect(filterRecommendedByListFilter([catalogItem], 'favorites', new Set()).length).toBe(0)
  expect(filterRecommendedByListFilter([catalogItem], 'favorites', new Set(['context7'])).length).toBe(1)
})

test('showInstalledSection / showRecommendedSection: "all" shows both, status filters only show installed, discovery filters only show recommended', () => {
  expect(showInstalledSection('all')).toBe(true)
  expect(showRecommendedSection('all')).toBe(true)
  expect(showInstalledSection('enabled')).toBe(true)
  expect(showRecommendedSection('enabled')).toBe(false)
  expect(showInstalledSection('popular')).toBe(false)
  expect(showRecommendedSection('popular')).toBe(true)
  expect(showInstalledSection('favorites')).toBe(true)
  expect(showRecommendedSection('favorites')).toBe(true)
})
