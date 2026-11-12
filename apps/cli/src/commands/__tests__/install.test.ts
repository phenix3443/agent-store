import { test, expect } from 'bun:test'
import { runInstall } from '../install'
import type { Engine, InstallOutcome } from '@as/types'

const outcome: InstallOutcome = {
  slug: 'some-mcp', version: '1.2.0', installedAt: '2026-06-18T00:00:00Z',
  category: 'mcp', enabled: ['claude', 'codex'], notEnabled: [],
}

function makeEngine(overrides?: Partial<Engine>): Engine {
  return {
    installAndEnable: async () => outcome,
    ...overrides,
  } as unknown as Engine
}

test('runInstall shows done steps, a sync step per enabled tool and the summary', async () => {
  const lines: string[] = []
  expect(await runInstall(makeEngine(), ['some-mcp'], s => lines.push(s))).toBe(0)
  const out = lines.join('\n')
  expect(out).toContain('Syncing to claude...')
  expect(out).toContain('Syncing to codex...')
  expect(out).toContain('Installed some-mcp 1.2.0')
  expect(out).not.toContain('Not enabled')
})

test('runInstall shows usage when no slug', async () => {
  const lines: string[] = []
  expect(await runInstall(makeEngine(), [], s => lines.push(s))).toBe(2)
  expect(lines.join('\n')).toContain('Usage')
})

test('runInstall shows the error and returns 1 on failure', async () => {
  const lines: string[] = []
  const engine = makeEngine({ installAndEnable: async () => { throw new Error('Not found') } })
  expect(await runInstall(engine, ['unknown'], s => lines.push(s))).toBe(1)
  expect(lines.join('\n')).toContain('Not found')
})

test('runInstall rejects more than one slug', async () => {
  let installed = false
  const lines: string[] = []
  const engine = makeEngine({ installAndEnable: async () => { installed = true; return outcome } })
  expect(await runInstall(engine, ['a', 'b'], s => lines.push(s))).toBe(2)
  expect(installed).toBe(false)
  expect(lines.join('\n')).toContain('one slug')
})

test('runInstall rejects unknown options', async () => {
  const lines: string[] = []
  expect(await runInstall(makeEngine(), ['some-mcp', '--bogus'], s => lines.push(s))).toBe(2)
  expect(lines.join('\n')).toContain('unknown option --bogus')
})

test('runInstall passes --target and --force to the engine', async () => {
  let got: unknown
  const engine = makeEngine({ installAndEnable: async (_s: string, o?: unknown) => { got = o; return outcome } })
  expect(await runInstall(engine, ['x', '--target', 'codex', '--force'], () => {})).toBe(0)
  expect(got).toEqual({ target: 'codex', force: true })
})

test('runInstall rejects a bad --target value', async () => {
  expect(await runInstall(makeEngine(), ['x', '--target', 'vim'], () => {})).toBe(2)
})

// L1: the item is installed; a tool waiting for config is a next step, not a failure.
test('runInstall of an MCP that needs config exits 0 and says how to finish', async () => {
  const lines: string[] = []
  const engine = makeEngine({
    installAndEnable: async () => ({
      ...outcome, slug: 'token-mcp', enabled: [],
      notEnabled: (['claude', 'codex'] as const).map(target => ({
        target, reason: 'needs-config' as const,
        message: 'token-mcp needs configuration before it can be enabled (missing: token); run `aas config token-mcp`',
      })),
    }),
  })
  expect(await runInstall(engine, ['token-mcp'], s => lines.push(s))).toBe(0)
  const out = lines.join('\n')
  expect(out).toContain('Installed token-mcp 1.2.0')
  expect(out).toContain('Not enabled for claude: token-mcp needs configuration')
  expect(out).toContain('then: aas enable token-mcp --for claude')
  expect(out).toContain('then: aas enable token-mcp --for codex')
  expect(out).not.toContain('Syncing to')
})

test('runInstall of a provider without a key exits 0 and says how to finish', async () => {
  const lines: string[] = []
  const engine = makeEngine({
    installAndEnable: async () => ({
      ...outcome, slug: 'p', category: 'provider', enabled: [],
      notEnabled: [{ target: 'claude', reason: 'no-key', message: 'p has no API key configured; run: aas config p' }],
    }),
  })
  expect(await runInstall(engine, ['p'], s => lines.push(s))).toBe(0)
  expect(lines.join('\n')).toContain('Not enabled for claude: p has no API key configured; run: aas config p; then: aas enable p --for claude')
})
