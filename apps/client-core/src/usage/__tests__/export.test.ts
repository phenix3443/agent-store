import { test, expect, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile } from 'fs/promises'
import type { UsageSummaryRow } from '@as/types'
import { formatUsageExport, exportUsageToFile } from '../export'
import { openUsageDb } from '../db'

let aasHome: string | undefined

afterEach(async () => {
  if (aasHome) await rm(aasHome, { recursive: true, force: true })
  aasHome = undefined
})

const rows: UsageSummaryRow[] = [
  {
    date: '2026-07-06', providerSlug: 'openai', target: 'claude', model: 'gpt-4o',
    requestCount: 3, successCount: 3, unpricedRequestCount: 0,
    inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.05,
  },
]

test('formatUsageExport writes a CSV header and a row', () => {
  const csv = formatUsageExport(rows, 'csv')
  const [header, first] = csv.split('\n')
  expect(header).toBe('date,provider,target,model,requests,success,inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,costUsd')
  expect(first).toBe('2026-07-06,openai,claude,gpt-4o,3,3,100,50,0,0,0.05')
})

test('formatUsageExport quotes cells containing commas or quotes', () => {
  const tricky: UsageSummaryRow[] = [{ ...rows[0]!, model: 'a,b"c' }]
  const csv = formatUsageExport(tricky, 'csv')
  expect(csv.split('\n')[1]).toContain('"a,b""c"')
})

test('formatUsageExport emits pretty JSON of the rows', () => {
  const json = formatUsageExport(rows, 'json')
  expect(JSON.parse(json)).toEqual(rows)
})

test('exportUsageToFile writes a file under exports/ and returns its path', async () => {
  aasHome = await mkdtemp('/tmp/as-export-')
  const db = openUsageDb(aasHome)
  db.run(
    `INSERT INTO daily_rollups (date, provider_slug, target, model, request_count, success_count, unpriced_request_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     VALUES ('2026-07-06', 'openai', 'claude', 'gpt-4o', 3, 3, 0, 100, 50, 0, 0, 0.05)`
  )

  const path = await exportUsageToFile(aasHome, 'csv')
  expect(path).toContain('/exports/usage-')
  expect(path.endsWith('.csv')).toBe(true)
  const content = await readFile(path, 'utf-8')
  expect(content).toContain('date,provider,target,model')
  expect(content).toContain('openai,claude,gpt-4o')
})
