import { test, expect } from 'bun:test'
import { runSync } from '../sync'
import { runUpdate } from '../update'
import type { Engine, UpdateResult } from '@as/types'

function makeSyncEngine(synced: string[] = [], errors: Array<{slug:string;error:string}> = []): Engine {
  return { sync: async () => ({ synced, errors }) } as unknown as Engine
}

function makeUpdateEngine(results: UpdateResult[] = []): Engine {
  return {
    update: async () => results,
    checkUpdates: async () => [],
  } as unknown as Engine
}

test('runSync shows synced count', async () => {
  const lines: string[] = []
  await runSync(makeSyncEngine(['openai-provider:claude', 'openai-provider:codex']), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('2')
})

test('runSync passes --for target to engine', async () => {
  let calledWith: string[] | undefined
  const engine = {
    sync: async (targets: string[]) => { calledWith = targets; return { synced: [], errors: [] } },
  } as unknown as Engine
  await runSync(engine, ['--for', 'claude'], () => {})
  expect(calledWith).toEqual(['claude'])
})

test('runSync shows errors when present', async () => {
  const lines: string[] = []
  await runSync(makeSyncEngine([], [{ slug: 'bad', error: 'failed' }]), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('bad')
})

test('runUpdate shows updated results', async () => {
  const results: UpdateResult[] = [{ slug: 'openai-provider', fromVersion: '1.0.0', toVersion: '2.0.0' }]
  const lines: string[] = []
  await runUpdate(makeUpdateEngine(results), [], s => lines.push(s))
  const out = lines.join('\n')
  expect(out).toContain('openai-provider')
  expect(out).toContain('2.0.0')
})

test('runUpdate shows "No updates" when none', async () => {
  const lines: string[] = []
  await runUpdate(makeUpdateEngine([]), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('No updates')
})

test('runUninstall shows usage when no slug', async () => {
  const { runUninstall } = await import('../uninstall')
  const lines: string[] = []
  await runUninstall({ uninstall: async () => {} } as unknown as Engine, [], s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage')
})

test('runUninstall shows success', async () => {
  const { runUninstall } = await import('../uninstall')
  const lines: string[] = []
  await runUninstall({ uninstall: async () => {} } as unknown as Engine, ['test-mcp'], s => lines.push(s))
  expect(lines.join('\n')).toContain('Uninstalled')
})

// M2: a failed update is reported and fails the command.
test('runUpdate reports items that failed and returns 1, keeping the ones that updated', async () => {
  const lines: string[] = []
  const engine = {
    update: async () => {
      throw Object.assign(new Error('Update failed'), {
        name: 'UpdateFailedError',
        updated: [{ slug: 'a', fromVersion: '1', toVersion: '2' }],
        failures: [{ slug: 'b', error: 'changed outside Agent Store' }],
      })
    },
  } as unknown as Engine
  expect(await runUpdate(engine, [], s => lines.push(s))).toBe(1)
  const out = lines.join('\n')
  expect(out).toContain('Updated a from 1 to 2')
  expect(out).toContain('b was not updated: changed outside Agent Store')
})

test('runUpdate returns 0 when everything updated', async () => {
  expect(await runUpdate(makeUpdateEngine([{ slug: 'a', fromVersion: '1', toVersion: '2' }]), [], () => {})).toBe(0)
})
