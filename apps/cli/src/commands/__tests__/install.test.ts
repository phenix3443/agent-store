import { test, expect } from 'bun:test'
import { runInstall } from '../install'
import type { Engine, InstalledItem } from '@as/types'

const installedEntry: InstalledItem = {
  slug: 'openai-provider', category: 'provider', version: '1.2.0',
  installedAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  compatibleWith: ['claude', 'codex'], enabledFor: {},
}

function makeEngine(overrides?: Partial<Engine>): Engine {
  return {
    install: async () => ({ slug: 'openai-provider', version: '1.2.0', installedAt: '2026-06-18T00:00:00Z' }),
    info: async () => ({
      ...installedEntry, name: 'OpenAI Provider', description: '',
 publisher: { id: 'p', slug: 'p', name: 'P', avatarUrl: '', tier: 'official' },
      tags: [], downloads: 0, configSchema: {}, supportedModels: ['gpt-4o'],
    }),
    enable: async () => undefined,
    ...overrides,
  } as unknown as Engine
}

test('runInstall shows done steps and installed summary', async () => {
  const lines: string[] = []
  await runInstall(makeEngine(), ['openai-provider'], s => lines.push(s))
  const out = lines.join('\n')
  expect(out).toContain('done')
  expect(out).toContain('Installed openai-provider 1.2.0')
})

test('runInstall shows config warning for provider', async () => {
  const lines: string[] = []
  await runInstall(makeEngine(), ['openai-provider'], s => lines.push(s))
  expect(lines.join('\n')).toContain('aas config')
})

test('runInstall shows sync step for each compatible target', async () => {
  const lines: string[] = []
  await runInstall(makeEngine(), ['openai-provider'], s => lines.push(s))
  const out = lines.join('\n')
  expect(out).toContain('claude')
  expect(out).toContain('codex')
})

test('runInstall shows usage when no slug', async () => {
  const lines: string[] = []
  await runInstall(makeEngine(), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage')
})

test('runInstall shows error message on failure', async () => {
  const lines: string[] = []
  const engine = makeEngine({ install: async () => { throw new Error('Not found') } })
  await runInstall(engine, ['unknown'], s => lines.push(s))
  expect(lines.join('\n')).toContain('Not found')
})

test('runInstall returns 0 on success', async () => {
  expect(await runInstall(makeEngine(), ['openai-provider'], () => {})).toBe(0)
})

test('runInstall returns non-zero when install fails', async () => {
  const engine = makeEngine({ install: async () => { throw new Error('Not found') } })
  expect(await runInstall(engine, ['unknown'], () => {})).toBe(1)
})

test('runInstall returns non-zero when enabling a target fails', async () => {
  const lines: string[] = []
  const engine = makeEngine({ enable: async () => { throw new Error('conflict') } })
  expect(await runInstall(engine, ['openai-provider'], s => lines.push(s))).toBe(1)
  expect(lines.join('\n')).toContain('conflict')
})

test('runInstall returns usage error without a slug', async () => {
  expect(await runInstall(makeEngine(), [], () => {})).toBe(2)
})

test('runInstall rejects more than one slug', async () => {
  let installed = false
  const lines: string[] = []
  const engine = makeEngine({ install: async () => { installed = true; return { slug: 'a', version: '1', installedAt: '' } } })
  expect(await runInstall(engine, ['a', 'b'], s => lines.push(s))).toBe(2)
  expect(installed).toBe(false)
  expect(lines.join('\n')).toContain('one slug')
})

test('runInstall rejects unknown options', async () => {
  const lines: string[] = []
  expect(await runInstall(makeEngine(), ['openai-provider', '--bogus'], s => lines.push(s))).toBe(2)
  expect(lines.join('\n')).toContain('unknown option --bogus')
})

test('runInstall passes --target and --force to the engine', async () => {
  let got: unknown
  const engine = makeEngine({ install: async (_s: string, o?: unknown) => { got = o; return { slug: 'x', version: '1', installedAt: '' } } })
  expect(await runInstall(engine, ['x', '--target', 'codex', '--force'], () => {})).toBe(0)
  expect(got).toEqual({ target: 'codex', force: true })
})

test('runInstall rejects a bad --target value', async () => {
  expect(await runInstall(makeEngine(), ['x', '--target', 'vim'], () => {})).toBe(2)
})

test('runInstall leaves enabling skills to the engine', async () => {
  const enabled: string[] = []
  const engine = makeEngine({
    enable: async (_s: string, t: string) => { enabled.push(t) },
    info: async () => ({ ...installedEntry, category: 'skill', enabledFor: { codex: true, claude: true } }),
  } as unknown as Partial<Engine>)
  expect(await runInstall(engine, ['a-skill'], () => {})).toBe(0)
  expect(enabled).toEqual([])
})
