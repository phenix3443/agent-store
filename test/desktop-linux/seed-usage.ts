// Writes relay usage for the screenshots: daily rollups over the last 12 days for
// two providers, both agents and three models, plus recent request-log rows
// (one fallback, one error). Fixture data for CI only.
// Usage: bun test/desktop-linux/seed-usage.ts <AS_HOME>
import { mkdirSync } from 'fs'
import { openUsageDb } from '../../apps/client-core/src/usage/db'

const home = process.argv[2]
if (!home) throw new Error('usage: seed-usage.ts <AS_HOME>')
mkdirSync(home, { recursive: true })
const db = openUsageDb(home)

const series: [string, 'claude' | 'codex', string, number, number, number, number][] = [
  // provider, agent, model, requests/day, input tokens/request, output tokens/request, USD/request
  ['openrouter', 'claude', 'claude-sonnet-4-5', 40, 5200, 900, 0.021],
  ['openrouter', 'claude', 'claude-haiku-4-5', 18, 3100, 420, 0.004],
  ['deepseek', 'codex', 'deepseek-chat', 25, 4300, 760, 0.002],
]
const day = 86_400_000
for (let d = 11; d >= 0; d--) {
  const date = new Date(Date.now() - d * day).toISOString().slice(0, 10)
  series.forEach(([provider, target, model, perDay, tin, tout, usd], i) => {
    const n = Math.max(1, Math.round(perDay * (0.6 + ((d * 7 + i * 3) % 9) / 10)))
    const ok = n - ((d + i) % 4 === 0 ? 1 : 0)
    db.run(
      `INSERT OR REPLACE INTO daily_rollups
         (date, provider_slug, target, model, request_count, success_count, unpriced_request_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
       VALUES (?,?,?,?,?,?,?,?,?,0,0,?)`,
      [date, provider, target, model, n, ok, 0, n * tin, n * tout, n * usd]
    )
  })
}

const now = Date.now()
const logs: [string, 'claude' | 'codex', string, number, number, boolean][] = [
  ['openrouter', 'claude', 'claude-sonnet-4-5', 200, 1840, false],
  ['deepseek', 'codex', 'deepseek-chat', 200, 960, false],
  ['deepseek', 'claude', 'claude-sonnet-4-5', 200, 2310, true],
  ['openrouter', 'claude', 'claude-sonnet-4-5', 429, 310, false],
  ['openrouter', 'claude', 'claude-haiku-4-5', 200, 720, false],
]
logs.forEach(([provider, target, model, status, latency, fallback], i) => {
  db.run(
    `INSERT INTO request_logs
       (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
     VALUES (?,?,?,?,?,?,0,0,?,?,?,1,?)`,
    [new Date(now - (logs.length - i) * 60_000).toISOString(), provider, target, model, 4000, 700, 0.01, status, latency, fallback ? 1 : 0]
  )
})
db.close()
