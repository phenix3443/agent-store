import { test, expect } from 'bun:test'
import { runUsage } from '../usage'
import type { Engine, UsageSummaryRow } from '@as/types'

function makeEngine(rows: UsageSummaryRow[]): Engine {
  return {
    search: async () => [], install: async () => ({ slug: '', version: '', installedAt: '' }),
    uninstall: async () => undefined, enable: async () => undefined, disable: async () => undefined,
    getConfigSchema: async () => ({ schema: {}, current: {} }), setConfig: async () => undefined,
    sync: async () => ({ synced: [], errors: [] }), checkUpdates: async () => [], update: async () => [],
    list: async () => [], info: async () => { throw new Error('not installed') },
    duplicateProvider: async () => ({ newSlug: '' }),
    getUsageSummary: async () => rows,
    parsePricingFromUrl: async () => ({}),
  } as unknown as Engine
}

const sampleRow: UsageSummaryRow = {
  date: '2026-07-05', providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
  requestCount: 12, successCount: 11, unpricedRequestCount: 0,
  inputTokens: 5000, outputTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.045,
}

test('runUsage prints a table row per summary entry', async () => {
  const lines: string[] = []
  await runUsage(makeEngine([sampleRow]), [], s => lines.push(s))
  const output = lines.join('\n')
  expect(output).toContain('yls')
  expect(output).toContain('claude-sonnet-4-5')
  expect(output).toContain('12')
})

test('runUsage shows "—" for unpriced rows instead of $0.00', async () => {
  const unpriced: UsageSummaryRow = { ...sampleRow, costUsd: 0, unpricedRequestCount: 12 }
  const lines: string[] = []
  await runUsage(makeEngine([unpriced]), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('—')
})

test('runUsage prints a message when there is no usage data', async () => {
  const lines: string[] = []
  await runUsage(makeEngine([]), [], s => lines.push(s))
  expect(lines.join('\n')).toContain('No usage data')
})

test('runUsage passes --days, --provider, --for through to getUsageSummary', async () => {
  let received: unknown
  const engine = makeEngine([])
  engine.getUsageSummary = async (options) => { received = options; return [] }
  await runUsage(engine, ['--days', '7', '--provider', 'yls', '--for', 'claude'], () => {})
  expect(received).toEqual({ days: 7, providerSlug: 'yls', target: 'claude' })
})
