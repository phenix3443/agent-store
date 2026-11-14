import type { UsageSummaryRow } from '@as/types'

export type UsagePeriod = 1 | 7 | 30

export const USAGE_PERIODS: UsagePeriod[] = [1, 7, 30]

export interface UsageTotals {
  requests: number
  successes: number
  unpriced: number
  tokens: number
  costUsd: number
  models: number
}

export interface UsageBreakdownRow {
  providerSlug: string
  model: string
  target: string
  requests: number
  successes: number
  unpriced: number
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export function usageTotals(rows: UsageSummaryRow[]): UsageTotals {
  return {
    requests: rows.reduce((s, r) => s + r.requestCount, 0),
    successes: rows.reduce((s, r) => s + r.successCount, 0),
    unpriced: rows.reduce((s, r) => s + r.unpricedRequestCount, 0),
    tokens: rows.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0),
    costUsd: rows.reduce((s, r) => s + r.costUsd, 0),
    models: new Set(rows.map((r) => r.model)).size,
  }
}

/** One row per provider, model and agent across the period, most expensive first. */
export function usageBreakdown(rows: UsageSummaryRow[]): UsageBreakdownRow[] {
  const byKey = new Map<string, UsageBreakdownRow>()
  for (const r of rows) {
    const key = `${r.providerSlug}\u0000${r.model}\u0000${r.target}`
    const acc = byKey.get(key) ?? {
      providerSlug: r.providerSlug,
      model: r.model,
      target: r.target,
      requests: 0,
      successes: 0,
      unpriced: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    }
    acc.requests += r.requestCount
    acc.successes += r.successCount
    acc.unpriced += r.unpricedRequestCount
    acc.inputTokens += r.inputTokens
    acc.outputTokens += r.outputTokens
    acc.costUsd += r.costUsd
    byKey.set(key, acc)
  }
  return [...byKey.values()].sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests)
}

export function successRate(successes: number, requests: number): string {
  if (requests === 0) return '—'
  return `${((successes / requests) * 100).toFixed(1)}%`
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`
  return String(n)
}

export function formatUsd(n: number): string {
  if (n > 0 && n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

export function agentLabel(target: string): string {
  if (target === 'claude') return 'Claude Code'
  if (target === 'codex') return 'Codex'
  return target
}

/**
 * Rows from the last `period` calendar days, today included. Rollup dates are UTC
 * (recordRequest uses toISOString), and getUsageSummary's `days: n` reaches back n + 1 dates.
 */
export function rowsInPeriod(rows: UsageSummaryRow[], period: UsagePeriod, now: Date = new Date()): UsageSummaryRow[] {
  const cutoff = new Date(now.getTime() - (period - 1) * 86_400_000).toISOString().slice(0, 10)
  return rows.filter((r) => r.date >= cutoff)
}
