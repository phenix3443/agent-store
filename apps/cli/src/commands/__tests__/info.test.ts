import { test, expect } from 'bun:test'
import { runInfo } from '../info'
import type { Engine, ItemDetail } from '@as/types'

const publisher = { id: 'p1', slug: 'openai', name: 'OpenAI', avatarUrl: '', tier: 'official' as const }

const detail: ItemDetail = {
  slug: 'openai-provider', category: 'provider', version: '1.2.0',
  installedAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  compatibleWith: ['claude', 'codex'], enabledFor: { claude: true, codex: false },
  name: 'OpenAI Provider', description: 'OpenAI API provider',

  publisher, tags: [], downloads: 1_200_000,
  configSchema: {}, currentConfig: { apiKey: 'sk-test' },
  supportedModels: ['gpt-4o', 'gpt-4o-mini'],
}

function makeEngine(d: ItemDetail): Engine {
  return { info: async () => d } as unknown as Engine
}

test('runInfo of something not installed shows the catalog entry and how to install it', async () => {
  const lines: string[] = []
  const engine = {
    info: async () => { throw new Error('Item not installed: find-skills') },
    getResource: async () => ({
      id: 'github:vercel-labs/skills/find-skills', kind: 'skill', name: 'find-skills', description: 'Finds skills',
      author: { name: 'vercel-labs', url: null }, version: 'abc', homepageUrl: null, verified: false,
      repo: { fullName: 'vercel-labs/skills', dir: 'skills/find-skills', commit: 'e781cb4d07433dfe1d19e924ed45cc61738c55ec' },
    }),
  } as unknown as Engine
  await runInfo(engine, ['find-skills'], s => lines.push(s))
  const out = lines.join('\n')
  expect(out).toContain('Source       vercel-labs/skills/skills/find-skills @ e781cb4d0743')
  expect(out).toContain('Install with: aas install github:vercel-labs/skills/find-skills')
})

test('runInfo shows where a skill is deployed per tool', async () => {
  const lines: string[] = []
  const skill: ItemDetail = {
    ...detail, slug: 's', category: 'skill', enabledFor: { claude: true, codex: false },
    deployments: { claude: { path: '/home/u/.claude/skills/s', mode: 'symlink', sourceHash: 'h' } },
  }
  await runInfo(makeEngine(skill), ['s'], s => lines.push(s))
  expect(lines.join('\n')).toContain('claude: enabled (symlink /home/u/.claude/skills/s)  |  codex: disabled')
})

test('runInfo prints slug, version, tier', async () => {
  const lines: string[] = []
  await runInfo(makeEngine(detail), ['openai-provider'], s => lines.push(s))
  const out = lines.join('\n')
  expect(out).toContain('openai-provider')
  expect(out).toContain('1.2.0')
  expect(out).toContain('official')
})

test('runInfo prints publisher name', async () => {
  const lines: string[] = []
  await runInfo(makeEngine(detail), ['openai-provider'], s => lines.push(s))
  expect(lines.join('\n')).toContain('OpenAI')
})

test('runInfo prints enable status', async () => {
  const lines: string[] = []
  await runInfo(makeEngine(detail), ['openai-provider'], s => lines.push(s))
  const out = lines.join('\n')
  expect(out).toContain('enabled')
  expect(out).toContain('disabled')
})

test('runInfo prints models for provider', async () => {
  const lines: string[] = []
  await runInfo(makeEngine(detail), ['openai-provider'], s => lines.push(s))
  expect(lines.join('\n')).toContain('gpt-4o')
})

test('runInfo prints config hint for provider', async () => {
  const lines: string[] = []
  await runInfo(makeEngine(detail), ['openai-provider'], s => lines.push(s))
  expect(lines.join('\n')).toContain('aas config')
})

test('runInfo shows usage when no slug', async () => {
  const lines: string[] = []
  await runInfo(makeEngine(detail), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage')
})
