# Usage & Cost Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every relay-forwarded request's token usage, compute cost from per-provider pricing, and expose the results via CLI (`aas usage`) and RPC (`getUsageSummary`) for the GUI dashboard to consume.

**Architecture:** A new `apps/client-core/src/usage/` module owns a `bun:sqlite` database (`{aasHome}/usage.db`) with a detail table (30-day retention) and a permanent daily-rollup table. The relay (`apps/client-core/src/relay/server.ts`) tees the upstream response so token-usage parsing never blocks the client-facing response. Cost is computed from a per-provider `pricing` map stored alongside the existing `modelMapping` in each provider's local `config.json` — there is no built-in default pricing table.

**Tech Stack:** `bun:sqlite` (built into Bun, no new dependency), TypeScript, existing `@as/client-core`/`@as/cli` packages.

## Global Constraints

- Storage is `bun:sqlite` at `{aasHome}/usage.db` — no other database engine.
- Both streaming (SSE) and non-streaming responses must be parsed for token usage — this is not optional/deferred.
- No built-in default pricing for any model, official or third-party. Cost is `null` (not `0`) when a provider has no `pricing` entry for the requested model.
- Detail rows (`request_logs`) are pruned after 30 days; daily rollups (`daily_rollups`) are kept forever.
- Any failure inside usage recording must never break the relay's actual request forwarding — it is fire-and-forget, errors are swallowed and logged to `console.error`.
- `parsePricingFromUrl` returns mock data this iteration — a real LLM-based extraction is explicitly out of scope (see spec's "不做的事").

---

### Task 1: Usage database schema

**Files:**
- Create: `apps/client-core/src/usage/db.ts`
- Test: `apps/client-core/src/usage/__tests__/db.test.ts`

**Interfaces:**
- Produces: `openUsageDb(aasHome: string): Database` (re-exports the `bun:sqlite` `Database` type) — used by every other task in this plan.

- [ ] **Step 1: Write the failing test**

Create `apps/client-core/src/usage/__tests__/db.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { openUsageDb } from '../db'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp('/tmp/as-usage-db-test-')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('openUsageDb creates request_logs and daily_rollups tables', () => {
  const db = openUsageDb(dir)
  db.run(
    `INSERT INTO request_logs (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['2026-07-05T00:00:00Z', 'openai-provider', 'codex', 'gpt-5', 10, 20, 0, 0, 0.01, 200, 500, 0, 0]
  )
  const rows = db.query('SELECT * FROM request_logs').all() as Array<{ provider_slug: string }>
  expect(rows).toHaveLength(1)
  expect(rows[0].provider_slug).toBe('openai-provider')

  db.run(
    `INSERT INTO daily_rollups (date, provider_slug, target, model, request_count, success_count, unpriced_request_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['2026-07-05', 'openai-provider', 'codex', 'gpt-5', 1, 1, 0, 10, 20, 0, 0, 0.01]
  )
  const rollups = db.query('SELECT * FROM daily_rollups').all() as Array<{ date: string }>
  expect(rollups).toHaveLength(1)
  expect(rollups[0].date).toBe('2026-07-05')
})

test('openUsageDb is idempotent — calling it twice on the same aasHome does not error', () => {
  openUsageDb(dir)
  expect(() => openUsageDb(dir)).not.toThrow()
})

test('daily_rollups enforces uniqueness on (date, provider_slug, target, model)', () => {
  const db = openUsageDb(dir)
  const insert = () =>
    db.run(
      `INSERT INTO daily_rollups (date, provider_slug, target, model, request_count, success_count, unpriced_request_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ['2026-07-05', 'openai-provider', 'codex', 'gpt-5', 1, 1, 0, 10, 20, 0, 0, 0.01]
    )
  insert()
  expect(insert).toThrow()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/usage/__tests__/db.test.ts`
Expected: FAIL — cannot find module `../db`.

- [ ] **Step 3: Implement `db.ts`**

Create `apps/client-core/src/usage/db.ts`:

```ts
import { Database } from 'bun:sqlite'
import { join } from 'path'

export function openUsageDb(aasHome: string): Database {
  const db = new Database(join(aasHome, 'usage.db'), { create: true })

  db.exec(`
    CREATE TABLE IF NOT EXISTS request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      provider_slug TEXT NOT NULL,
      target TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL,
      status_code INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      is_streaming INTEGER NOT NULL,
      is_fallback INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_rollups (
      date TEXT NOT NULL,
      provider_slug TEXT NOT NULL,
      target TEXT NOT NULL,
      model TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      unpriced_request_count INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date, provider_slug, target, model)
    )
  `)

  return db
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/client-core && bun test src/usage/__tests__/db.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/client-core && bun run type-check`
Expected: no errors.

```bash
git add apps/client-core/src/usage/db.ts apps/client-core/src/usage/__tests__/db.test.ts
git commit -m "feat(client-core): add usage database schema"
```

---

### Task 2: Per-provider pricing configuration

**Files:**
- Modify: `apps/client-core/src/config/provider.ts`
- Modify: `apps/client-core/src/config/__tests__/provider.test.ts`

**Interfaces:**
- Produces: `ModelPricing` interface, `ProviderConnection.pricingUrl?: string`, `ProviderConnection.pricing?: Record<string, ModelPricing>` — consumed by Task 4 (`logger.ts`'s `computeCost`) and by the GUI provider-edit-form task in the companion CLI-client-full-fidelity plan.

- [ ] **Step 1: Write the failing tests**

Read the current file first:

```bash
cat apps/client-core/src/config/provider.ts
```

Append to `apps/client-core/src/config/__tests__/provider.test.ts` (after the existing tests, using the same `dir`/`writeFile` helpers already imported there):

```ts
test('readProviderConnection reads pricingUrl and pricing', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({
    apiKey: 'k',
    pricingUrl: 'https://example.com/pricing',
    pricing: {
      'gpt-5': { input: 2.5, output: 15, cacheRead: 0.25 },
    },
  }))
  const conn = await readProviderConnection(dir)
  expect(conn.pricingUrl).toBe('https://example.com/pricing')
  expect(conn.pricing).toEqual({ 'gpt-5': { input: 2.5, output: 15, cacheRead: 0.25 } })
})

test('readProviderConnection returns undefined pricingUrl/pricing when absent', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k' }))
  const conn = await readProviderConnection(dir)
  expect(conn.pricingUrl).toBeUndefined()
  expect(conn.pricing).toBeUndefined()
})

test('readProviderConnection ignores a malformed pricing entry (non-numeric input)', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({
    apiKey: 'k',
    pricing: { 'gpt-5': { input: 'not-a-number', output: 15 } },
  }))
  const conn = await readProviderConnection(dir)
  expect(conn.pricing).toBeUndefined()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/client-core && bun test src/config/__tests__/provider.test.ts -t pricing`
Expected: FAIL — `pricingUrl`/`pricing` are `undefined` because the reader doesn't parse them yet (the first test's assertions on populated values fail).

- [ ] **Step 3: Implement the pricing fields**

In `apps/client-core/src/config/provider.ts`, add after the `ProviderConnection` interface's existing fields:

```ts
export interface ModelPricing {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

export interface ProviderConnection {
  apiKey?: string
  baseUrl?: string
  authType?: ProviderAuthType
  modelMapping?: Record<string, string>
  pricingUrl?: string
  pricing?: Record<string, ModelPricing>
}
```

Add these two helper functions after `readModelMapping`:

```ts
function readModelPricing(value: unknown): ModelPricing | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  if (typeof raw['input'] !== 'number' || typeof raw['output'] !== 'number') return undefined
  const pricing: ModelPricing = { input: raw['input'], output: raw['output'] }
  if (typeof raw['cacheRead'] === 'number') pricing.cacheRead = raw['cacheRead']
  if (typeof raw['cacheWrite'] === 'number') pricing.cacheWrite = raw['cacheWrite']
  return pricing
}

function readPricing(value: unknown): Record<string, ModelPricing> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return undefined
  const result: Record<string, ModelPricing> = {}
  for (const [model, raw] of entries) {
    const pricing = readModelPricing(raw)
    if (!pricing) return undefined
    result[model] = pricing
  }
  return result
}
```

In `readProviderConnection`, add to the returned object (after `modelMapping: readModelMapping(raw['modelMapping']),`):

```ts
      pricingUrl: readString(raw['pricingUrl']),
      pricing: readPricing(raw['pricing']),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/client-core && bun test src/config/__tests__/provider.test.ts`
Expected: PASS (full file, old and new tests).

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/client-core && bun run type-check`
Expected: no errors.

```bash
git add apps/client-core/src/config/provider.ts apps/client-core/src/config/__tests__/provider.test.ts
git commit -m "feat(client-core): add per-provider pricingUrl/pricing config fields"
```

---

### Task 3: Usage parser (Claude Messages API + OpenAI Responses API, streaming + non-streaming)

**Files:**
- Create: `apps/client-core/src/usage/usage-parser.ts`
- Test: `apps/client-core/src/usage/__tests__/usage-parser.test.ts`

**Interfaces:**
- Produces: `UsageTokens` interface (`{ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }`), `parseClaudeUsage(bodyText: string, isStreaming: boolean): UsageTokens`, `parseOpenAIUsage(bodyText: string, isStreaming: boolean): UsageTokens` — consumed by Task 4's `logger.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/client-core/src/usage/__tests__/usage-parser.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { parseClaudeUsage, parseOpenAIUsage } from '../usage-parser'

test('parseClaudeUsage: non-streaming JSON body', () => {
  const body = JSON.stringify({
    id: 'msg_1',
    usage: { input_tokens: 25, output_tokens: 45, cache_creation_input_tokens: 5, cache_read_input_tokens: 10 },
  })
  const usage = parseClaudeUsage(body, false)
  expect(usage).toEqual({ inputTokens: 25, outputTokens: 45, cacheReadTokens: 10, cacheWriteTokens: 5 })
})

test('parseClaudeUsage: non-streaming body missing cache fields defaults them to 0', () => {
  const body = JSON.stringify({ id: 'msg_1', usage: { input_tokens: 25, output_tokens: 45 } })
  const usage = parseClaudeUsage(body, false)
  expect(usage).toEqual({ inputTokens: 25, outputTokens: 45, cacheReadTokens: 0, cacheWriteTokens: 0 })
})

test('parseClaudeUsage: streaming SSE — input from message_start, output from the final message_delta', () => {
  const body = [
    'event: message_start',
    'data: {"type":"message_start","message":{"usage":{"input_tokens":25,"cache_creation_input_tokens":5,"cache_read_input_tokens":10,"output_tokens":1}}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","delta":{"text":"hi"}}',
    '',
    'event: message_delta',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":45}}',
    '',
  ].join('\n')
  const usage = parseClaudeUsage(body, true)
  expect(usage).toEqual({ inputTokens: 25, outputTokens: 45, cacheReadTokens: 10, cacheWriteTokens: 5 })
})

test('parseOpenAIUsage: non-streaming JSON body', () => {
  const body = JSON.stringify({
    id: 'resp_1',
    usage: { input_tokens: 50, output_tokens: 20, input_tokens_details: { cached_tokens: 12 } },
  })
  const usage = parseOpenAIUsage(body, false)
  expect(usage).toEqual({ inputTokens: 50, outputTokens: 20, cacheReadTokens: 12, cacheWriteTokens: 0 })
})

test('parseOpenAIUsage: streaming SSE — reads usage from the response.completed event', () => {
  const body = [
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"hi"}',
    '',
    'event: response.completed',
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":50,"output_tokens":20,"input_tokens_details":{"cached_tokens":12}}}}',
    '',
  ].join('\n')
  const usage = parseOpenAIUsage(body, true)
  expect(usage).toEqual({ inputTokens: 50, outputTokens: 20, cacheReadTokens: 12, cacheWriteTokens: 0 })
})

test('parseOpenAIUsage: missing input_tokens_details defaults cacheReadTokens to 0', () => {
  const body = JSON.stringify({ id: 'resp_1', usage: { input_tokens: 50, output_tokens: 20 } })
  const usage = parseOpenAIUsage(body, false)
  expect(usage.cacheReadTokens).toBe(0)
})

test('parseClaudeUsage: unparseable streaming body returns all zeros rather than throwing', () => {
  const usage = parseClaudeUsage('not valid sse at all', true)
  expect(usage).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/usage/__tests__/usage-parser.test.ts`
Expected: FAIL — cannot find module `../usage-parser`.

- [ ] **Step 3: Implement `usage-parser.ts`**

Create `apps/client-core/src/usage/usage-parser.ts`:

```ts
export interface UsageTokens {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

const ZERO_USAGE: UsageTokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }

function parseSseDataLines(bodyText: string): unknown[] {
  const events: unknown[] = []
  for (const line of bodyText.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const jsonText = trimmed.slice('data:'.length).trim()
    try {
      events.push(JSON.parse(jsonText))
    } catch {
      // skip malformed data lines
    }
  }
  return events
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function readNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

export function parseClaudeUsage(bodyText: string, isStreaming: boolean): UsageTokens {
  try {
    if (!isStreaming) {
      const parsed = JSON.parse(bodyText) as { usage?: Record<string, unknown> }
      const usage = parsed.usage ?? {}
      return {
        inputTokens: readNumber(usage['input_tokens']),
        outputTokens: readNumber(usage['output_tokens']),
        cacheReadTokens: readNumber(usage['cache_read_input_tokens']),
        cacheWriteTokens: readNumber(usage['cache_creation_input_tokens']),
      }
    }

    const result = { ...ZERO_USAGE }
    for (const event of parseSseDataLines(bodyText)) {
      const record = readRecord(event)
      if (!record) continue
      if (record['type'] === 'message_start') {
        const message = readRecord(record['message'])
        const usage = readRecord(message?.['usage'])
        if (usage) {
          result.inputTokens = readNumber(usage['input_tokens'])
          result.cacheReadTokens = readNumber(usage['cache_read_input_tokens'])
          result.cacheWriteTokens = readNumber(usage['cache_creation_input_tokens'])
        }
      } else if (record['type'] === 'message_delta') {
        const usage = readRecord(record['usage'])
        if (usage && typeof usage['output_tokens'] === 'number') {
          result.outputTokens = usage['output_tokens']
        }
      }
    }
    return result
  } catch {
    return { ...ZERO_USAGE }
  }
}

export function parseOpenAIUsage(bodyText: string, isStreaming: boolean): UsageTokens {
  try {
    const extractFromUsage = (usage: Record<string, unknown> | undefined): UsageTokens => {
      if (!usage) return { ...ZERO_USAGE }
      const details = readRecord(usage['input_tokens_details'])
      return {
        inputTokens: readNumber(usage['input_tokens']),
        outputTokens: readNumber(usage['output_tokens']),
        cacheReadTokens: readNumber(details?.['cached_tokens']),
        cacheWriteTokens: 0,
      }
    }

    if (!isStreaming) {
      const parsed = JSON.parse(bodyText) as { usage?: Record<string, unknown> }
      return extractFromUsage(parsed.usage)
    }

    for (const event of parseSseDataLines(bodyText)) {
      const record = readRecord(event)
      if (record?.['type'] === 'response.completed') {
        const response = readRecord(record['response'])
        return extractFromUsage(readRecord(response?.['usage']))
      }
    }
    return { ...ZERO_USAGE }
  } catch {
    return { ...ZERO_USAGE }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/client-core && bun test src/usage/__tests__/usage-parser.test.ts`
Expected: PASS (8/8).

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/client-core && bun run type-check`
Expected: no errors.

```bash
git add apps/client-core/src/usage/usage-parser.ts apps/client-core/src/usage/__tests__/usage-parser.test.ts
git commit -m "feat(client-core): add Claude/OpenAI usage parsers for streaming and non-streaming responses"
```

---

### Task 4: Cost calculation and request logging

**Files:**
- Create: `apps/client-core/src/usage/logger.ts`
- Test: `apps/client-core/src/usage/__tests__/logger.test.ts`

**Interfaces:**
- Consumes: `openUsageDb` (Task 1), `ModelPricing` (Task 2), `UsageTokens` (Task 3).
- Produces: `computeCost(pricing: Record<string, ModelPricing> | undefined, model: string, usage: UsageTokens): number | null`, `recordRequest(db: Database, input: RecordRequestInput): void` where `RecordRequestInput = { providerSlug: string; target: 'claude' | 'codex'; model: string; usage: UsageTokens; costUsd: number | null; statusCode: number; latencyMs: number; isStreaming: boolean; isFallback?: boolean }` — consumed by Task 5 (relay integration) and Task 6 (queries, indirectly via the rows it produces).

- [ ] **Step 1: Write the failing test**

Create `apps/client-core/src/usage/__tests__/logger.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { openUsageDb } from '../db'
import { computeCost, recordRequest } from '../logger'
import type { ModelPricing } from '../../config/provider'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp('/tmp/as-usage-logger-test-')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const pricing: Record<string, ModelPricing> = {
  'gpt-5': { input: 2, output: 10, cacheRead: 0.2 },
}

test('computeCost: calculates input+output+cacheRead cost for a priced model', () => {
  const cost = computeCost(pricing, 'gpt-5', { inputTokens: 1_000_000, outputTokens: 500_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 })
  // input: 1M * $2/M = $2; output: 0.5M * $10/M = $5; cacheRead: 1M * $0.2/M = $0.2
  expect(cost).toBeCloseTo(7.2, 5)
})

test('computeCost: returns null when the model has no pricing entry', () => {
  const cost = computeCost(pricing, 'unknown-model', { inputTokens: 100, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 })
  expect(cost).toBeNull()
})

test('computeCost: returns null when pricing is undefined entirely', () => {
  const cost = computeCost(undefined, 'gpt-5', { inputTokens: 100, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 })
  expect(cost).toBeNull()
})

test('recordRequest: writes a detail row and an initial daily rollup row', () => {
  const db = openUsageDb(dir)
  recordRequest(db, {
    providerSlug: 'openai-provider', target: 'codex', model: 'gpt-5',
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.001, statusCode: 200, latencyMs: 400, isStreaming: false,
  })
  const logs = db.query('SELECT * FROM request_logs').all() as Array<{ provider_slug: string; cost_usd: number }>
  expect(logs).toHaveLength(1)
  expect(logs[0].provider_slug).toBe('openai-provider')
  expect(logs[0].cost_usd).toBeCloseTo(0.001, 6)

  const rollups = db.query('SELECT * FROM daily_rollups').all() as Array<{ request_count: number; success_count: number; cost_usd: number }>
  expect(rollups).toHaveLength(1)
  expect(rollups[0].request_count).toBe(1)
  expect(rollups[0].success_count).toBe(1)
  expect(rollups[0].cost_usd).toBeCloseTo(0.001, 6)
})

test('recordRequest: a second call for the same day/provider/target/model accumulates the rollup', () => {
  const db = openUsageDb(dir)
  const base = { providerSlug: 'openai-provider', target: 'codex' as const, model: 'gpt-5', isStreaming: false }
  recordRequest(db, { ...base, usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0.001, statusCode: 200, latencyMs: 400 })
  recordRequest(db, { ...base, usage: { inputTokens: 200, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0.002, statusCode: 500, latencyMs: 900 })

  const rollups = db.query('SELECT * FROM daily_rollups').all() as Array<{
    request_count: number; success_count: number; input_tokens: number; cost_usd: number
  }>
  expect(rollups).toHaveLength(1)
  expect(rollups[0].request_count).toBe(2)
  expect(rollups[0].success_count).toBe(1)
  expect(rollups[0].input_tokens).toBe(300)
  expect(rollups[0].cost_usd).toBeCloseTo(0.003, 6)
})

test('recordRequest: a null cost is not added to the rollup total and increments unpriced_request_count', () => {
  const db = openUsageDb(dir)
  recordRequest(db, {
    providerSlug: 'openai-provider', target: 'codex', model: 'unpriced-model',
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: null, statusCode: 200, latencyMs: 400, isStreaming: false,
  })
  const rollups = db.query('SELECT * FROM daily_rollups').all() as Array<{ cost_usd: number; unpriced_request_count: number }>
  expect(rollups[0].cost_usd).toBe(0)
  expect(rollups[0].unpriced_request_count).toBe(1)
})

test('recordRequest: prunes request_logs older than 30 days but keeps daily_rollups', () => {
  const db = openUsageDb(dir)
  const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
  const oldDay = oldDate.slice(0, 10)
  db.run(
    `INSERT INTO request_logs (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [oldDate, 'openai-provider', 'codex', 'gpt-5', 1, 1, 0, 0, 0.001, 200, 100, 0, 0]
  )
  db.run(
    `INSERT INTO daily_rollups (date, provider_slug, target, model, request_count, success_count, unpriced_request_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [oldDay, 'openai-provider', 'codex', 'gpt-5', 1, 1, 0, 1, 1, 0, 0, 0.001]
  )
  recordRequest(db, {
    providerSlug: 'openai-provider', target: 'codex', model: 'gpt-5',
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.001, statusCode: 200, latencyMs: 100, isStreaming: false,
  })
  const logs = db.query('SELECT * FROM request_logs').all()
  expect(logs).toHaveLength(1) // the 40-day-old detail row was pruned; only today's new row remains
  const rollups = db.query('SELECT * FROM daily_rollups').all()
  expect(rollups).toHaveLength(2) // rollups are never pruned — the seeded old-day rollup and today's new one both remain
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/usage/__tests__/logger.test.ts`
Expected: FAIL — cannot find module `../logger`.

- [ ] **Step 3: Implement `logger.ts`**

Create `apps/client-core/src/usage/logger.ts`:

```ts
import type { Database } from 'bun:sqlite'
import type { ModelPricing } from '../config/provider'
import type { UsageTokens } from './usage-parser'

export function computeCost(
  pricing: Record<string, ModelPricing> | undefined,
  model: string,
  usage: UsageTokens
): number | null {
  const rate = pricing?.[model]
  if (!rate) return null
  const inputCost = (usage.inputTokens / 1_000_000) * rate.input
  const outputCost = (usage.outputTokens / 1_000_000) * rate.output
  const cacheReadCost = rate.cacheRead ? (usage.cacheReadTokens / 1_000_000) * rate.cacheRead : 0
  const cacheWriteCost = rate.cacheWrite ? (usage.cacheWriteTokens / 1_000_000) * rate.cacheWrite : 0
  return inputCost + outputCost + cacheReadCost + cacheWriteCost
}

export interface RecordRequestInput {
  providerSlug: string
  target: 'claude' | 'codex'
  model: string
  usage: UsageTokens
  costUsd: number | null
  statusCode: number
  latencyMs: number
  isStreaming: boolean
  isFallback?: boolean
}

export function recordRequest(db: Database, input: RecordRequestInput): void {
  const now = new Date().toISOString()
  const date = now.slice(0, 10)

  db.run(
    `INSERT INTO request_logs
       (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      now, input.providerSlug, input.target, input.model,
      input.usage.inputTokens, input.usage.outputTokens, input.usage.cacheReadTokens, input.usage.cacheWriteTokens,
      input.costUsd, input.statusCode, input.latencyMs, input.isStreaming ? 1 : 0, input.isFallback ? 1 : 0,
    ]
  )

  const success = input.statusCode >= 200 && input.statusCode < 300 ? 1 : 0
  const unpriced = input.costUsd === null ? 1 : 0
  const cost = input.costUsd ?? 0

  db.run(
    `INSERT INTO daily_rollups
       (date, provider_slug, target, model, request_count, success_count, unpriced_request_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     VALUES (?,?,?,?,1,?,?,?,?,?,?,?)
     ON CONFLICT (date, provider_slug, target, model) DO UPDATE SET
       request_count = request_count + 1,
       success_count = success_count + excluded.success_count,
       unpriced_request_count = unpriced_request_count + excluded.unpriced_request_count,
       input_tokens = input_tokens + excluded.input_tokens,
       output_tokens = output_tokens + excluded.output_tokens,
       cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
       cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
       cost_usd = cost_usd + excluded.cost_usd`,
    [
      date, input.providerSlug, input.target, input.model,
      success, unpriced,
      input.usage.inputTokens, input.usage.outputTokens, input.usage.cacheReadTokens, input.usage.cacheWriteTokens,
      cost,
    ]
  )

  db.run(`DELETE FROM request_logs WHERE created_at < datetime('now', '-30 days')`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/client-core && bun test src/usage/__tests__/logger.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/client-core && bun run type-check`
Expected: no errors.

```bash
git add apps/client-core/src/usage/logger.ts apps/client-core/src/usage/__tests__/logger.test.ts
git commit -m "feat(client-core): add cost calculation and request logging with 30-day detail retention"
```

---

### Task 5: Relay integration — record usage without blocking the client response

**Files:**
- Modify: `apps/client-core/src/relay/server.ts`
- Test: `apps/client-core/src/relay/__tests__/server.test.ts` (check if this file exists first — see Step 1)

**Interfaces:**
- Consumes: `openUsageDb` (Task 1), `parseClaudeUsage`/`parseOpenAIUsage` (Task 3), `computeCost`/`recordRequest` (Task 4), `ProviderConnection.pricing` (Task 2).
- Produces: `recordUsageAsync(input: RecordUsageAsyncInput): Promise<void>` (exported from a new `apps/client-core/src/usage/record-usage.ts`, so `server.ts` stays focused on routing) where `RecordUsageAsyncInput = { aasHome: string; providerSlug: string; target: 'claude' | 'codex'; model: string; pricing: Record<string, ModelPricing> | undefined; bodyStream: ReadableStream<Uint8Array>; isStreaming: boolean; statusCode: number; startedAt: number }`.

- [ ] **Step 1: Read the current relay files**

```bash
cat apps/client-core/src/relay/server.ts
cat apps/client-core/src/relay/forward.ts
ls apps/client-core/src/relay/__tests__/
```

- [ ] **Step 2: Write the failing test**

Create `apps/client-core/src/usage/__tests__/record-usage.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { openUsageDb } from '../db'
import { recordUsageAsync } from '../record-usage'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp('/tmp/as-record-usage-test-')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

test('recordUsageAsync parses a non-streaming Claude response and writes a priced row', async () => {
  const body = JSON.stringify({ usage: { input_tokens: 100, output_tokens: 50 } })
  await recordUsageAsync({
    aasHome: dir, providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
    pricing: { 'claude-sonnet-4-5': { input: 3, output: 15 } },
    bodyStream: streamOf(body), isStreaming: false, statusCode: 200, startedAt: Date.now() - 500,
  })
  const db = openUsageDb(dir)
  const rows = db.query('SELECT * FROM request_logs').all() as Array<{ provider_slug: string; input_tokens: number; cost_usd: number }>
  expect(rows).toHaveLength(1)
  expect(rows[0].provider_slug).toBe('yls')
  expect(rows[0].input_tokens).toBe(100)
  expect(rows[0].cost_usd).toBeGreaterThan(0)
})

test('recordUsageAsync parses a streaming OpenAI response', async () => {
  const body = [
    'event: response.completed',
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5}}}',
    '',
  ].join('\n')
  await recordUsageAsync({
    aasHome: dir, providerSlug: 'openrouter', target: 'codex', model: 'gpt-5-codex',
    pricing: undefined,
    bodyStream: streamOf(body), isStreaming: true, statusCode: 200, startedAt: Date.now() - 200,
  })
  const db = openUsageDb(dir)
  const rows = db.query('SELECT * FROM request_logs').all() as Array<{ output_tokens: number; cost_usd: number | null }>
  expect(rows).toHaveLength(1)
  expect(rows[0].output_tokens).toBe(5)
  expect(rows[0].cost_usd).toBeNull()
})

test('recordUsageAsync never throws even when the stream body is garbage', async () => {
  await expect(
    recordUsageAsync({
      aasHome: dir, providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
      pricing: undefined, bodyStream: streamOf('not json at all'), isStreaming: false,
      statusCode: 500, startedAt: Date.now(),
    })
  ).resolves.toBeUndefined()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/usage/__tests__/record-usage.test.ts`
Expected: FAIL — cannot find module `../record-usage`.

- [ ] **Step 4: Implement `record-usage.ts`**

Create `apps/client-core/src/usage/record-usage.ts`:

```ts
import type { ModelPricing } from '../config/provider'
import { openUsageDb } from './db'
import { parseClaudeUsage, parseOpenAIUsage } from './usage-parser'
import { computeCost, recordRequest } from './logger'

export interface RecordUsageAsyncInput {
  aasHome: string
  providerSlug: string
  target: 'claude' | 'codex'
  model: string
  pricing: Record<string, ModelPricing> | undefined
  bodyStream: ReadableStream<Uint8Array>
  isStreaming: boolean
  statusCode: number
  startedAt: number
  isFallback?: boolean
}

export async function recordUsageAsync(input: RecordUsageAsyncInput): Promise<void> {
  try {
    const bodyText = await new Response(input.bodyStream).text()
    const usage = input.target === 'claude'
      ? parseClaudeUsage(bodyText, input.isStreaming)
      : parseOpenAIUsage(bodyText, input.isStreaming)
    const costUsd = computeCost(input.pricing, input.model, usage)
    const db = openUsageDb(input.aasHome)
    recordRequest(db, {
      providerSlug: input.providerSlug,
      target: input.target,
      model: input.model,
      usage,
      costUsd,
      statusCode: input.statusCode,
      latencyMs: Date.now() - input.startedAt,
      isStreaming: input.isStreaming,
      isFallback: input.isFallback,
    })
  } catch (err) {
    console.error('[usage] failed to record request usage:', err)
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/client-core && bun test src/usage/__tests__/record-usage.test.ts`
Expected: PASS (3/3).

- [ ] **Step 6: Wire into the relay server**

Replace the body of `apps/client-core/src/relay/server.ts`'s request handler's response-building section. Read the file's current full content again to get exact surrounding code (from Step 1), then apply this change: after `const upstreamResponse = await forwardRequest(...)` and before the final `return new Response(...)`, insert the tee + async record call, and change the final return to use the client-side branch of the tee:

```ts
      const startedAt = Date.now()
      const upstreamResponse = await forwardRequest(
        url.pathname,
        body,
        {
          baseUrl: connection.baseUrl,
          apiKey: connection.apiKey,
          authType: connection.authType,
          modelMapping: connection.modelMapping,
        },
        fetchImpl
      )

      const contentType = upstreamResponse.headers.get('content-type') ?? ''
      const isStreaming = contentType.includes('text/event-stream')
      const requestedModel = typeof (body as Record<string, unknown>)['model'] === 'string'
        ? (body as Record<string, unknown>)['model'] as string
        : 'unknown'

      if (upstreamResponse.body) {
        const [clientStream, usageStream] = upstreamResponse.body.tee()
        void recordUsageAsync({
          aasHome, providerSlug: provider.slug, target, model: requestedModel,
          pricing: connection.pricing, bodyStream: usageStream, isStreaming,
          statusCode: upstreamResponse.status, startedAt,
        })
        return new Response(clientStream, { status: upstreamResponse.status, headers: upstreamResponse.headers })
      }

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: upstreamResponse.headers,
      })
```

Add the import at the top of `server.ts`:

```ts
import { recordUsageAsync } from '../usage/record-usage'
```

Note: `requestedModel` is read from the ORIGINAL request body's `model` field (before `applyModelMapping` rewrites it inside `forwardRequest`) — this records usage under the model name the CLI asked for, matching what the user sees in their own tool, not the rewritten upstream model name. This is a deliberate choice, not an oversight: users care about "what did my `claude-sonnet-4-5` request cost", not the upstream's internal model alias.

- [ ] **Step 7: Run the full relay test suite to confirm no regressions**

Run: `cd apps/client-core && bun test src/relay`
Expected: all existing relay tests still pass (they mock `fetchImpl` and don't assert on usage recording, so they should be unaffected — if any test asserts on the exact `Response` object identity, note it in your report but this is not expected to break behavior).

- [ ] **Step 8: Type-check and commit**

Run: `cd apps/client-core && bun run type-check`
Expected: no errors.

```bash
git add apps/client-core/src/usage/record-usage.ts apps/client-core/src/usage/__tests__/record-usage.test.ts apps/client-core/src/relay/server.ts
git commit -m "feat(client-core): record usage asynchronously on every relayed request"
```

---

### Task 6: Usage summary queries

**Files:**
- Create: `apps/client-core/src/usage/queries.ts`
- Test: `apps/client-core/src/usage/__tests__/queries.test.ts`

**Interfaces:**
- Consumes: `openUsageDb` (Task 1).
- Produces: `UsageSummaryRow = { date: string; providerSlug: string; target: string; model: string; requestCount: number; successCount: number; unpricedRequestCount: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number }`, `getDailySummary(aasHome: string, options?: { days?: number; providerSlug?: string; target?: 'claude' | 'codex' }): UsageSummaryRow[]` — consumed by Task 7 (AASEngine/RPC) and Task 8 (CLI).

- [ ] **Step 1: Write the failing test**

Create `apps/client-core/src/usage/__tests__/queries.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { openUsageDb } from '../db'
import { recordRequest } from '../logger'
import { getDailySummary } from '../queries'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp('/tmp/as-usage-queries-test-')
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/usage/__tests__/queries.test.ts`
Expected: FAIL — cannot find module `../queries`.

- [ ] **Step 3: Implement `queries.ts`**

Create `apps/client-core/src/usage/queries.ts`:

```ts
import { openUsageDb } from './db'

export interface UsageSummaryRow {
  date: string
  providerSlug: string
  target: string
  model: string
  requestCount: number
  successCount: number
  unpricedRequestCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
}

export interface GetDailySummaryOptions {
  days?: number
  providerSlug?: string
  target?: 'claude' | 'codex'
}

interface DailyRollupRow {
  date: string
  provider_slug: string
  target: string
  model: string
  request_count: number
  success_count: number
  unpriced_request_count: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  cost_usd: number
}

export function getDailySummary(aasHome: string, options: GetDailySummaryOptions = {}): UsageSummaryRow[] {
  const db = openUsageDb(aasHome)
  const days = options.days ?? 30

  const conditions: string[] = [`date >= date('now', ?)`]
  const params: unknown[] = [`-${days} days`]

  if (options.providerSlug) {
    conditions.push('provider_slug = ?')
    params.push(options.providerSlug)
  }
  if (options.target) {
    conditions.push('target = ?')
    params.push(options.target)
  }

  const rows = db
    .query(`SELECT * FROM daily_rollups WHERE ${conditions.join(' AND ')} ORDER BY date DESC`)
    .all(...params) as DailyRollupRow[]

  return rows.map(row => ({
    date: row.date,
    providerSlug: row.provider_slug,
    target: row.target,
    model: row.model,
    requestCount: row.request_count,
    successCount: row.success_count,
    unpricedRequestCount: row.unpriced_request_count,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    costUsd: row.cost_usd,
  }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/client-core && bun test src/usage/__tests__/queries.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/client-core && bun run type-check`
Expected: no errors.

```bash
git add apps/client-core/src/usage/queries.ts apps/client-core/src/usage/__tests__/queries.test.ts
git commit -m "feat(client-core): add getDailySummary usage query"
```

---

### Task 7: AASEngine methods + RPC exposure

**Files:**
- Modify: `packages/types/src/engine.ts`
- Modify: `apps/client-core/src/engine.ts`
- Modify: `apps/client-core/src/index.ts`
- Modify: `apps/cli/src/commands/rpc.ts`
- Modify: `apps/cli/src/commands/__tests__/rpc.test.ts`
- Test: `apps/client-core/src/__tests__/engine.test.ts` (append)

**Interfaces:**
- Consumes: `getDailySummary` (Task 6).
- Produces: `AASEngine.getUsageSummary(options?: { days?: number; providerSlug?: string; target?: ToolTarget }): Promise<UsageSummaryRow[]>`, `AASEngine.parsePricingFromUrl(url: string): Promise<Record<string, ModelPricing>>` (mock implementation), RPC methods `'getUsageSummary'` and `'parsePricingFromUrl'` — consumed by the GUI (in the companion CLI-client-full-fidelity plan) and Task 8 (CLI command).

- [ ] **Step 1: Add the interface methods**

Read `packages/types/src/engine.ts` first to see the exact current imports and interface layout:

```bash
cat packages/types/src/engine.ts
```

`packages/types` must not depend on `apps/client-core` (the workspace dependency graph runs the other way — `apps/client-core` depends on `packages/types`, never the reverse). So `ModelPricing` and `UsageSummaryRow` are defined directly in `packages/types/src/engine.ts` as the canonical shapes; `apps/client-core/src/config/provider.ts`'s `ModelPricing` (added in Task 2) will re-export this one instead of keeping its own separate definition (see Step 1 continuation below). Add these type definitions to `packages/types/src/engine.ts`, near the other exported interfaces:

```ts
export interface ModelPricing {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

export interface UsageSummaryRow {
  date: string
  providerSlug: string
  target: string
  model: string
  requestCount: number
  successCount: number
  unpricedRequestCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
}

export interface UsageSummaryOptions {
  days?: number
  providerSlug?: string
  target?: ToolTarget
}
```

Add to the `AASEngine` interface, after `duplicateProvider`:

```ts
  /** Returns daily usage/cost rollups, optionally filtered by provider or target. */
  getUsageSummary(options?: UsageSummaryOptions): Promise<UsageSummaryRow[]>
  /** Fetches a provider's pricing page and extracts a draft pricing table for user review. Returns mock data in this iteration. */
  parsePricingFromUrl(url: string): Promise<Record<string, ModelPricing>>
```

Now in `apps/client-core/src/config/provider.ts`, make its existing `ModelPricing` interface (from Task 2) re-export the shared one instead of redefining it — modify the top of the file:

```ts
export type { ModelPricing } from '@as/types'
```

Remove the local `export interface ModelPricing { ... }` block from `provider.ts` (added in Task 2) since it's now imported from `@as/types` instead — this avoids two structurally-identical-but-separate types.

- [ ] **Step 2: Write the failing test**

Append to `apps/client-core/src/__tests__/engine.test.ts` (reuses the file's existing `engine`/`aasHome` from `beforeEach`):

```ts
test('getUsageSummary: returns rows recorded via the usage logger for this aasHome', async () => {
  const { openUsageDb } = await import('../usage/db')
  const { recordRequest } = await import('../usage/logger')
  const db = openUsageDb(aasHome)
  recordRequest(db, {
    providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.01, statusCode: 200, latencyMs: 100, isStreaming: false,
  })

  const rows = await engine.getUsageSummary()
  expect(rows).toHaveLength(1)
  expect(rows[0].providerSlug).toBe('yls')
})

test('getUsageSummary: forwards the target filter through to the query', async () => {
  const { openUsageDb } = await import('../usage/db')
  const { recordRequest } = await import('../usage/logger')
  const db = openUsageDb(aasHome)
  recordRequest(db, {
    providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0.01, statusCode: 200, latencyMs: 100, isStreaming: false,
  })

  const rows = await engine.getUsageSummary({ target: 'codex' })
  expect(rows).toHaveLength(0)
})

test('parsePricingFromUrl: returns a non-empty mock pricing table', async () => {
  const pricing = await engine.parsePricingFromUrl('https://example.com/pricing')
  expect(Object.keys(pricing).length).toBeGreaterThan(0)
  for (const entry of Object.values(pricing)) {
    expect(typeof entry.input).toBe('number')
    expect(typeof entry.output).toBe('number')
  }
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/client-core && bun test src/__tests__/engine.test.ts -t "getUsageSummary|parsePricingFromUrl"`
Expected: FAIL — `engine.getUsageSummary is not a function`.

- [ ] **Step 4: Implement the engine methods**

In `apps/client-core/src/engine.ts`, add to the imports:

```ts
import { getDailySummary } from './usage/queries'
```

Add to `AASEngineImpl`, after `duplicateProvider`:

```ts
  async getUsageSummary(options?: UsageSummaryOptions): Promise<UsageSummaryRow[]> {
    return getDailySummary(this.paths.aasHome, options)
  }

  async parsePricingFromUrl(_url: string): Promise<Record<string, ModelPricing>> {
    return {
      'example-model': { input: 1, output: 5 },
    }
  }
```

Add `UsageSummaryRow`, `UsageSummaryOptions`, `ModelPricing` to the existing `import type { ... } from '@as/types'` line at the top of `engine.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/client-core && bun test src/__tests__/engine.test.ts`
Expected: PASS (full file).

- [ ] **Step 6: Export from the package index**

In `apps/client-core/src/index.ts`, confirm `AASEngineImpl` is already exported (it is, per existing code) — no change needed there since `UsageSummaryRow`/`ModelPricing` are consumed via `@as/types`, already exported from that package's `index.ts` (add them to `packages/types/src/index.ts`'s existing `export type { ... } from './engine'` list: add `ModelPricing, UsageSummaryRow, UsageSummaryOptions`).

- [ ] **Step 7: Add the RPC methods**

In `apps/cli/src/commands/rpc.ts`, add to `RPC_METHODS`, after `duplicateProvider`:

```ts
  getUsageSummary: (e, a) => e.getUsageSummary(a[0] as UsageSummaryOptions | undefined),
  parsePricingFromUrl: (e, a) => e.parsePricingFromUrl(a[0] as string),
```

Add `UsageSummaryOptions` to the `import type { ... } from '@as/types'` line at the top of `rpc.ts`.

In `apps/cli/src/commands/__tests__/rpc.test.ts`'s `makeEngine` factory, add after `duplicateProvider`:

```ts
    getUsageSummary: async () => [],
    parsePricingFromUrl: async () => ({}),
```

Append a test:

```ts
test('runRpc calls getUsageSummary and returns its rows', async () => {
  const rows = [{ date: '2026-07-05', providerSlug: 'yls', target: 'claude', model: 'claude-sonnet-4-5', requestCount: 3, successCount: 3, unpricedRequestCount: 0, inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01 }]
  const getUsageSummary = async () => rows
  const lines: string[] = []
  const code = await runRpc(makeEngine({ getUsageSummary: getUsageSummary as AASEngine['getUsageSummary'] }), ['getUsageSummary', '[]'], s => lines.push(s))
  expect(code).toBe(0)
  expect(JSON.parse(lines[0]).data).toEqual(rows)
})
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/cli && bun test src/commands/__tests__/rpc.test.ts`
Expected: PASS (full file).

- [ ] **Step 9: Type-check everything touched and commit**

Run:
```bash
cd packages/types && bun run type-check
cd ../../apps/client-core && bun run type-check
cd ../cli && bun run type-check
```
Expected: no errors in any of the three.

```bash
git add packages/types/src/engine.ts packages/types/src/index.ts apps/client-core/src/engine.ts apps/client-core/src/config/provider.ts apps/client-core/src/__tests__/engine.test.ts apps/cli/src/commands/rpc.ts apps/cli/src/commands/__tests__/rpc.test.ts
git commit -m "feat: expose getUsageSummary and parsePricingFromUrl via AASEngine and RPC"
```

---

### Task 8: `aas usage` CLI command

**Files:**
- Create: `apps/cli/src/commands/usage.ts`
- Test: `apps/cli/src/commands/__tests__/usage.test.ts`
- Modify: `apps/cli/src/index.ts` (register the command)

**Interfaces:**
- Consumes: `AASEngine.getUsageSummary` (Task 7), `formatTable`/`padEnd` from `../utils/format`.
- Produces: `runUsage(engine: AASEngine, args: string[], out?: (s: string) => void): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `apps/cli/src/commands/__tests__/usage.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { runUsage } from '../usage'
import type { AASEngine, UsageSummaryRow } from '@as/types'

function makeEngine(rows: UsageSummaryRow[]): AASEngine {
  return {
    search: async () => [], install: async () => ({ slug: '', version: '', installedAt: '' }),
    uninstall: async () => undefined, enable: async () => undefined, disable: async () => undefined,
    getConfigSchema: async () => ({ schema: {}, current: {} }), setConfig: async () => undefined,
    sync: async () => ({ synced: [], errors: [] }), checkUpdates: async () => [], update: async () => [],
    list: async () => [], info: async () => { throw new Error('not installed') },
    duplicateProvider: async () => ({ newSlug: '' }),
    getUsageSummary: async () => rows,
    parsePricingFromUrl: async () => ({}),
  } as unknown as AASEngine
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/commands/__tests__/usage.test.ts`
Expected: FAIL — cannot find module `../usage`.

- [ ] **Step 3: Implement `usage.ts`**

Create `apps/cli/src/commands/usage.ts`:

```ts
import type { AASEngine, ToolTarget } from '@as/types'
import { formatTable } from '../utils/format'

function getFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

export async function runUsage(
  engine: AASEngine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<void> {
  const daysFlag = getFlag(args, '--days')
  const rows = await engine.getUsageSummary({
    days: daysFlag ? Number(daysFlag) : undefined,
    providerSlug: getFlag(args, '--provider'),
    target: getFlag(args, '--for') as ToolTarget | undefined,
  })

  if (rows.length === 0) {
    out('No usage data.')
    return
  }

  const WIDTHS = [12, 16, 8, 20, 8, 8, 10, 10]
  const headers = ['DATE', 'PROVIDER', 'TARGET', 'MODEL', 'REQS', 'OK', 'TOKENS', 'COST']
  const tableRows = rows.map(r => [
    r.date,
    r.providerSlug,
    r.target,
    r.model,
    String(r.requestCount),
    String(r.successCount),
    String(r.inputTokens + r.outputTokens),
    r.unpricedRequestCount > 0 && r.costUsd === 0 ? '—' : `$${r.costUsd.toFixed(4)}`,
  ])
  formatTable(headers, tableRows, WIDTHS).forEach(line => out(line))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/cli && bun test src/commands/__tests__/usage.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Register the command**

In `apps/cli/src/index.ts`, add the import:

```ts
import { runUsage } from './commands/usage'
```

Add to the `USAGE` string's `Commands:` list, after `relay <start|stop|status>`:

```
  usage [--days N] [--provider <slug>] [--for <claude|codex>]   Show usage and cost summary
```

Add to the `switch (command)` block in `main()`, after `case 'relay':`:

```ts
    case 'usage':      await runUsage(engine, rest); break
```

- [ ] **Step 6: Run the full CLI test suite**

Run: `cd apps/cli && bun test`
Expected: all tests pass, including the new `usage.test.ts`.

- [ ] **Step 7: Type-check and commit**

Run: `cd apps/cli && bun run type-check`
Expected: no errors.

```bash
git add apps/cli/src/commands/usage.ts apps/cli/src/commands/__tests__/usage.test.ts apps/cli/src/index.ts
git commit -m "feat(cli): add aas usage command"
```

---

### Task 9: Final integration pass — real environment test

**Files:** None (verification only).

- [ ] **Step 1: Run the full monorepo test suite and type-check**

```bash
npx turbo run test type-check
```
Expected: all tasks pass.

- [ ] **Step 2: Real-environment smoke test**

```bash
mkdir -p /tmp/as-usage-smoke
export AS_HOME=/tmp/as-usage-smoke
export CLAUDE_CONFIG_DIR=/tmp/as-usage-smoke/claude
export CODEX_CONFIG_DIR=/tmp/as-usage-smoke/codex
```

Install a provider (use the mock market server started via `pnpm --filter=@as/store dev` per the pattern established earlier in this repo, or install any provider slug returned by `aas search ""`), enable it for `claude`, then manually set its local `config.json`'s `pricing` field to a real entry for whatever model you'll test with (e.g. `{"claude-sonnet-4-5": {"input": 3, "output": 15}}`) and its `baseUrl`/`apiKey` to a real endpoint. Start the relay (`bun apps/cli/src/index.ts relay start`), send one real request to `http://127.0.0.1:18780/v1/messages` (or whichever port `relay status` reports) with a small `claude-sonnet-4-5` prompt, then run:

```bash
bun apps/cli/src/index.ts usage
```

Expected: one row showing the request you just made, non-zero tokens, and a non-`—` cost (since you configured pricing for that model). Confirm `sqlite3 $AS_HOME/usage.db "select * from request_logs;"` shows the same row directly in the database.

- [ ] **Step 3: Clean up the smoke-test environment**

```bash
bun apps/cli/src/index.ts relay stop
rm -rf /tmp/as-usage-smoke
```

- [ ] **Step 4: Report**

No commit for this task (verification only) — record the smoke-test result (pass/fail, and the actual `aas usage` output observed) in the task report for the final whole-branch review to reference.
