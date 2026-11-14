import { test, expect } from 'bun:test'
import type { UsageSummaryRow } from '@as/types'
import { formatTokens, formatUsd, rowsInPeriod, successRate, usageBreakdown, usageTotals } from '../usage'

function row(o: Partial<UsageSummaryRow>): UsageSummaryRow {
  return {
    date: '2026-11-13', providerSlug: 'p', target: 'claude', model: 'm',
    requestCount: 1, successCount: 1, unpricedRequestCount: 0,
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0,
    ...o,
  }
}

test('rowsInPeriod keeps the last N calendar days in UTC, today included', () => {
  const now = new Date('2026-11-13T10:00:00Z')
  const rows = [row({ date: '2026-11-13' }), row({ date: '2026-11-12' }), row({ date: '2026-11-07' }), row({ date: '2026-11-06' })]
  expect(rowsInPeriod(rows, 1, now).map((r) => r.date)).toEqual(['2026-11-13'])
  expect(rowsInPeriod(rows, 7, now).map((r) => r.date)).toEqual(['2026-11-13', '2026-11-12', '2026-11-07'])
  expect(rowsInPeriod(rows, 30, now)).toHaveLength(4)
})

test('usageTotals sums requests, tokens, cost and counts distinct models', () => {
  const totals = usageTotals([
    row({ model: 'a', requestCount: 3, successCount: 2, inputTokens: 10, outputTokens: 5, costUsd: 0.5, unpricedRequestCount: 1 }),
    row({ model: 'b', requestCount: 1, successCount: 1, inputTokens: 1, outputTokens: 1, costUsd: 0.25 }),
    row({ model: 'a', date: '2026-11-12' }),
  ])
  expect(totals).toEqual({ requests: 5, successes: 4, unpriced: 1, tokens: 17, costUsd: 0.75, models: 2 })
})

test('usageBreakdown merges days per provider, model and agent, most expensive first', () => {
  const rows = usageBreakdown([
    row({ providerSlug: 'a', model: 'x', target: 'claude', requestCount: 2, costUsd: 0.1 }),
    row({ providerSlug: 'a', model: 'x', target: 'claude', date: '2026-11-12', requestCount: 3, costUsd: 0.2 }),
    row({ providerSlug: 'a', model: 'x', target: 'codex', costUsd: 0.05 }),
    row({ providerSlug: 'b', model: 'y', target: 'claude', costUsd: 1 }),
  ])
  expect(rows.map((r) => [r.providerSlug, r.model, r.target, r.requests])).toEqual([
    ['b', 'y', 'claude', 1],
    ['a', 'x', 'claude', 5],
    ['a', 'x', 'codex', 1],
  ])
})

test('formatters', () => {
  expect(successRate(0, 0)).toBe('—')
  expect(successRate(199, 200)).toBe('99.5%')
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(1_500)).toBe('1.5K')
  expect(formatTokens(2_400_000)).toBe('2.4M')
  expect(formatUsd(0)).toBe('$0.00')
  expect(formatUsd(0.0042)).toBe('$0.0042')
  expect(formatUsd(12.345)).toBe('$12.35')
})
