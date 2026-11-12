import { test, expect } from 'bun:test'
import { runSearch } from '../search'
import type { CatalogResource, CatalogSearchResult, Engine, SearchOptions } from '@as/types'

const row: CatalogResource = {
  id: 'github:vercel-labs/skills/find-skills', kind: 'skill', name: 'find-skills',
  description: 'Helps users discover and install agent skills.', author: { name: 'vercel-labs', url: null },
  version: '76a98a285cb0', homepageUrl: null, installs: 1_200_000, stars: 12_000, verified: false, tags: [], transports: [],
  origin: {
    site: 'github', upstreamId: 'vercel-labs/skills/find-skills', url: null, upstreamVersion: null,
    upstreamUpdatedAt: null, syncedAt: '', unavailableAt: null, unavailableReason: null,
  },
  slug: 'skills-find-skills',
}

function makeEngine(result: Partial<CatalogSearchResult>, calls: Array<[string, SearchOptions | undefined]> = []): Engine {
  return {
    search: async (q: string, o?: SearchOptions) => {
      calls.push([q, o])
      return { resources: [], nextOffset: null, offline: false, ...result }
    },
  } as unknown as Engine
}

test('runSearch prints name, kind, source, installs, description and the install command', async () => {
  const lines: string[] = []
  await runSearch(makeEngine({ resources: [row] }), ['find'], s => lines.push(s))
  const out = lines.join('\n')
  expect(out).toContain('find-skills   skill · GitHub · 1.2M installs · 12K stars')
  expect(out).toContain('Helps users discover')
  expect(out).toContain('aas install github:vercel-labs/skills/find-skills')
})

test('runSearch passes the query words and --kind, and lists everything without a query', async () => {
  const calls: Array<[string, SearchOptions | undefined]> = []
  await runSearch(makeEngine({}, calls), ['github', 'issues', '--kind', 'mcp'], () => {})
  await runSearch(makeEngine({}, calls), [], () => {})
  expect(calls).toEqual([['github issues', { category: 'mcp', limit: 20 }], ['', { category: undefined, limit: 20 }]])
})

test('runSearch rejects an unknown --kind', async () => {
  const lines: string[] = []
  await runSearch(makeEngine({}), ['x', '--kind', 'plugin'], s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage')
})

test('runSearch says so when the results come from the offline cache, and when there are none', async () => {
  const lines: string[] = []
  await runSearch(makeEngine({ offline: true }), ['gpt'], s => lines.push(s))
  expect(lines.join('\n')).toContain('could not be reached')
  expect(lines.join('\n')).toContain('No results')
})
