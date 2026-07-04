import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { openUsageDb } from '../db'
import { recordRequest } from '../logger'
import { getDailySummary } from '../queries'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp('/tmp/aas-usage-queries-test-')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('getDailySummary returns rows sorted by date descending', () => {
  const db = openUsageDb(dir)
  recordRequest(db, {
    providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.01, statusCode: 200, latencyMs: 100, isStreaming: false,
  })
  recordRequest(db, {
    providerSlug: 'openrouter', target: 'codex', model: 'gpt-5-codex',
    usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.02, statusCode: 200, latencyMs: 100, isStreaming: false,
  })

  const rows = getDailySummary(dir)
  expect(rows).toHaveLength(2)
  expect(rows.map(r => r.providerSlug).sort()).toEqual(['openrouter', 'yls'])
})

test('getDailySummary filters by providerSlug', () => {
  const db = openUsageDb(dir)
  recordRequest(db, {
    providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.01, statusCode: 200, latencyMs: 100, isStreaming: false,
  })
  recordRequest(db, {
    providerSlug: 'openrouter', target: 'codex', model: 'gpt-5-codex',
    usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.02, statusCode: 200, latencyMs: 100, isStreaming: false,
  })

  const rows = getDailySummary(dir, { providerSlug: 'yls' })
  expect(rows).toHaveLength(1)
  expect(rows[0].providerSlug).toBe('yls')
})

test('getDailySummary filters by target', () => {
  const db = openUsageDb(dir)
  recordRequest(db, {
    providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.01, statusCode: 200, latencyMs: 100, isStreaming: false,
  })
  recordRequest(db, {
    providerSlug: 'openrouter', target: 'codex', model: 'gpt-5-codex',
    usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.02, statusCode: 200, latencyMs: 100, isStreaming: false,
  })

  const rows = getDailySummary(dir, { target: 'codex' })
  expect(rows).toHaveLength(1)
  expect(rows[0].target).toBe('codex')
})

test('getDailySummary excludes rows older than the requested day window', () => {
  const db = openUsageDb(dir)
  const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  db.run(
    `INSERT INTO daily_rollups (date, provider_slug, target, model, request_count, success_count, unpriced_request_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [oldDate, 'yls', 'claude', 'claude-sonnet-4-5', 1, 1, 0, 10, 5, 0, 0, 0.01]
  )
  recordRequest(db, {
    providerSlug: 'openrouter', target: 'codex', model: 'gpt-5-codex',
    usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.02, statusCode: 200, latencyMs: 100, isStreaming: false,
  })

  const rows = getDailySummary(dir, { days: 30 })
  expect(rows).toHaveLength(1)
  expect(rows[0].providerSlug).toBe('openrouter')
})

test('getDailySummary returns an empty array when the usage database has no rows', () => {
  const rows = getDailySummary(dir)
  expect(rows).toEqual([])
})
