# Dashboard Backend Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two backend capabilities the upcoming Overview dashboard GUI plan needs that don't exist yet: fetching the N most recent raw request-log rows (for "最近请求" and the proxy request log modal), and checking whether the relay daemon process is currently running (for the "本地代理运行状态" card) — both exposed as `AASEngine` methods and RPC methods, following the exact patterns already established for `getUsageSummary`/`listLocalConfigs`.

**Architecture:** `getRecentRequests` is a new query function in `apps/client-core/src/usage/queries.ts` reading the already-existing `request_logs` table directly (unlike `getDailySummary`, which reads the separate `daily_rollups` aggregate table). `getRelayStatus` is a new small module reading the same `{aasHome}/relay.pid` file and `process.kill(pid, 0)` liveness check that `apps/cli/src/index.ts`'s `realRelayOps()` already uses for the `aas relay status` CLI command — duplicated as a tiny reusable function rather than refactoring the existing CLI code path, since the CLI's PID-management (`spawnDetached`/`kill`/`writePidFile`) has side effects the read-only engine method must not have.

**Tech Stack:** TypeScript, Bun (`bun:sqlite`, `bun:test`) — no new dependencies.

## Global Constraints

- `getRecentRequests` must read `request_logs` directly (columns: `id, created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback` — see `apps/client-core/src/usage/db.ts`), ordered newest-first, default limit `20`, capped at whatever the caller requests (no server-side max beyond what's asked).
- `getRelayStatus` must not spawn, kill, or write anything — read-only liveness check against the existing PID file at `{aasHome}/relay.pid`, matching the exact liveness check already used by `apps/cli/src/index.ts`'s `realRelayOps().isRunning` (`process.kill(pid, 0)`, catching the throw for "not running").
- Both new RPC methods follow the existing `RPC_METHODS` table pattern in `apps/cli/src/commands/rpc.ts` — no new dispatch mechanism.
- No GUI work in this plan — this is backend-only, consumed by a separate not-yet-written Overview dashboard GUI plan.

---

### Task 1: `getRecentRequests`

**Files:**
- Modify: `apps/client-core/src/usage/queries.ts`
- Modify: `packages/types/src/engine.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `apps/client-core/src/engine.ts`
- Modify: `apps/cli/src/commands/rpc.ts`
- Test: `apps/client-core/src/usage/__tests__/queries.test.ts` (check `find apps/client-core/src/usage -iname "*queries*test*"` first — extend the existing file if found, matching its existing `openUsageDb`/seeding style; create it if it doesn't exist)
- Test: `apps/client-core/src/__tests__/engine.test.ts`

**Interfaces:**
- Consumes: `openUsageDb(aasHome): Database` (existing, `apps/client-core/src/usage/db.ts`).
- Produces: `export interface RecentRequestRow { id: number; createdAt: string; providerSlug: string; target: string; model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number | null; statusCode: number; latencyMs: number; isStreaming: boolean; isFallback: boolean }` in `apps/client-core/src/usage/queries.ts` (also exported from `@as/types`); `export function getRecentRequests(aasHome: string, options?: { limit?: number }): RecentRequestRow[]`; `AASEngine.getRecentRequests(options?: { limit?: number }): Promise<RecentRequestRow[]>`.

- [ ] **Step 1: Add the `RecentRequestRow` type**

In `packages/types/src/engine.ts`, add this interface near `UsageSummaryRow`:

```ts
export interface RecentRequestRow {
  id: number
  createdAt: string
  providerSlug: string
  target: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number | null
  statusCode: number
  latencyMs: number
  isStreaming: boolean
  isFallback: boolean
}
```

In `packages/types/src/index.ts`, add `RecentRequestRow` to the existing `export type { ... } from './engine'` block (alongside `LocalRelayConfig` added by a previous plan).

- [ ] **Step 2: Write the failing test**

Find the existing usage query test file: `find apps/client-core/src/usage -iname "*queries*test*"`. Read it to see how it seeds `request_logs`/`daily_rollups` rows (likely via direct `db.run(...)` or `db.query(...).run(...)` calls against `openUsageDb`). Add these tests to that file (or create `apps/client-core/src/usage/__tests__/queries.test.ts` with the same `beforeEach`/`afterEach` tmpdir setup as the file's siblings if no such file exists yet):

```ts
test('getRecentRequests returns rows newest-first, mapped to camelCase', () => {
  const db = openUsageDb(aasHome)
  db.run(
    `INSERT INTO request_logs (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['2026-07-01T00:00:00Z', 'provider-a', 'claude', 'claude-3-5-sonnet', 100, 50, 0, 0, 0.005, 200, 1200, 1, 0]
  )
  db.run(
    `INSERT INTO request_logs (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['2026-07-02T00:00:00Z', 'provider-b', 'codex', 'gpt-4o', 200, 100, 0, 0, null, 502, 800, 0, 1]
  )

  const rows = getRecentRequests(aasHome)

  expect(rows).toHaveLength(2)
  expect(rows[0]).toEqual({
    id: rows[0]!.id,
    createdAt: '2026-07-02T00:00:00Z',
    providerSlug: 'provider-b',
    target: 'codex',
    model: 'gpt-4o',
    inputTokens: 200,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: null,
    statusCode: 502,
    latencyMs: 800,
    isStreaming: false,
    isFallback: true,
  })
  expect(rows[1]!.providerSlug).toBe('provider-a')
  expect(rows[1]!.isFallback).toBe(false)
  expect(rows[1]!.isStreaming).toBe(true)
})

test('getRecentRequests respects the limit option', () => {
  const db = openUsageDb(aasHome)
  for (let i = 0; i < 5; i++) {
    db.run(
      `INSERT INTO request_logs (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`2026-07-0${i + 1}T00:00:00Z`, 'provider-a', 'claude', 'claude-3-5-sonnet', 1, 1, 0, 0, 0.001, 200, 100, 0, 0]
    )
  }

  const rows = getRecentRequests(aasHome, { limit: 2 })

  expect(rows).toHaveLength(2)
})

test('getRecentRequests defaults to a limit of 20', () => {
  const db = openUsageDb(aasHome)
  for (let i = 0; i < 25; i++) {
    db.run(
      `INSERT INTO request_logs (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`2026-07-${String(i + 1).padStart(2, '0')}T00:00:00Z`, 'provider-a', 'claude', 'claude-3-5-sonnet', 1, 1, 0, 0, 0.001, 200, 100, 0, 0]
    )
  }

  const rows = getRecentRequests(aasHome)

  expect(rows).toHaveLength(20)
})
```

Add `getRecentRequests` to the import from `'../queries'` at the top of the test file.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/client-core && bun test <path-to-the-test-file-from-step-2>`
Expected: FAIL — `getRecentRequests` is not exported.

- [ ] **Step 4: Implement `getRecentRequests`**

In `apps/client-core/src/usage/queries.ts`, add (alongside the existing `getDailySummary`):

```ts
export interface RecentRequestRow {
  id: number
  createdAt: string
  providerSlug: string
  target: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number | null
  statusCode: number
  latencyMs: number
  isStreaming: boolean
  isFallback: boolean
}

interface RequestLogRow {
  id: number
  created_at: string
  provider_slug: string
  target: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  cost_usd: number | null
  status_code: number
  latency_ms: number
  is_streaming: number
  is_fallback: number
}

export function getRecentRequests(aasHome: string, options: { limit?: number } = {}): RecentRequestRow[] {
  const db = openUsageDb(aasHome)
  const limit = options.limit ?? 20

  const rows = db
    .query(`SELECT * FROM request_logs ORDER BY id DESC LIMIT ?`)
    .all(limit) as RequestLogRow[]

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    providerSlug: row.provider_slug,
    target: row.target,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    costUsd: row.cost_usd,
    statusCode: row.status_code,
    latencyMs: row.latency_ms,
    isStreaming: row.is_streaming === 1,
    isFallback: row.is_fallback === 1,
  }))
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/client-core && bun test <path-to-the-test-file>`
Expected: all pass, including the 3 new tests.

- [ ] **Step 6: Add the `AASEngine` method**

In `packages/types/src/engine.ts`, add to the `AASEngine` interface (after `getUsageSummary`):

```ts
  /** Returns the N most recent raw request-log rows, newest first. */
  getRecentRequests(options?: { limit?: number }): Promise<RecentRequestRow[]>
```

Add `RecentRequestRow` to the type-only import at the top of `packages/types/src/engine.ts` if it's a separate file section requiring it (it's defined in the same file per Step 1, so no import needed there — just confirm the interface reference resolves).

In `apps/client-core/src/engine.ts`:
- Add `RecentRequestRow` to the existing `import type { ... } from '@as/types'` block.
- Add `getRecentRequests` to the existing `import { getDailySummary } from './usage/queries'` line, changing it to `import { getDailySummary, getRecentRequests } from './usage/queries'`.
- Add this method to `AASEngineImpl` (right after `getUsageSummary`):

```ts
  async getRecentRequests(options?: { limit?: number }): Promise<RecentRequestRow[]> {
    return getRecentRequests(this.paths.aasHome, options)
  }
```

- [ ] **Step 7: Write the failing engine test**

Add to `apps/client-core/src/__tests__/engine.test.ts`:

```ts
test('getRecentRequests returns rows from the usage database', async () => {
  const { openUsageDb } = await import('../usage/db')
  const db = openUsageDb(aasHome)
  db.run(
    `INSERT INTO request_logs (created_at, provider_slug, target, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, status_code, latency_ms, is_streaming, is_fallback)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['2026-07-01T00:00:00Z', 'provider-a', 'claude', 'claude-3-5-sonnet', 100, 50, 0, 0, 0.005, 200, 1200, 1, 0]
  )

  const rows = await engine.getRecentRequests()

  expect(rows).toHaveLength(1)
  expect(rows[0]!.providerSlug).toBe('provider-a')
})
```

- [ ] **Step 8: Run the test, confirm it fails, then passes after Step 6's implementation**

Run: `cd apps/client-core && bun test src/__tests__/engine.test.ts`
Expected: fails before Step 6 is applied (it should already be applied by this point in the task — if you're following steps in order, this test should already pass; if not, re-check Step 6 was applied correctly), then passes.

- [ ] **Step 9: Add the RPC dispatch entry**

In `apps/cli/src/commands/rpc.ts`, add to `RPC_METHODS` (after `getUsageSummary`):

```ts
  getRecentRequests: (e, a) => e.getRecentRequests(a[0] as { limit?: number } | undefined),
```

- [ ] **Step 10: Run the full client-core and cli suites plus type checks**

Run: `cd apps/client-core && bun test && bun run type-check && cd ../cli && bun test && bun run type-check`
Expected: all pass, 0 type errors.

- [ ] **Step 11: Commit**

```bash
git add apps/client-core/src/usage/queries.ts apps/client-core/src/usage/__tests__ packages/types/src/engine.ts packages/types/src/index.ts apps/client-core/src/engine.ts apps/client-core/src/__tests__/engine.test.ts apps/cli/src/commands/rpc.ts
git commit -m "feat(client-core): add getRecentRequests for raw request-log queries"
```

(Adjust the `apps/client-core/src/usage/__tests__` path in `git add` to the exact test file path found/created in Step 2.)

---

### Task 2: `getRelayStatus`

**Files:**
- Create: `apps/client-core/src/relay/daemon-status.ts`
- Test: `apps/client-core/src/relay/__tests__/daemon-status.test.ts`
- Modify: `packages/types/src/engine.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `apps/client-core/src/engine.ts`
- Modify: `apps/cli/src/commands/rpc.ts`
- Test: `apps/client-core/src/__tests__/engine.test.ts`

**Interfaces:**
- Consumes: nothing new (reads `{aasHome}/relay.pid` directly via `fs/promises`).
- Produces: `export interface RelayStatus { running: boolean; pid?: number }` in `@as/types`; `export async function getRelayDaemonStatus(aasHome: string): Promise<RelayStatus>` in `apps/client-core/src/relay/daemon-status.ts`; `AASEngine.getRelayStatus(): Promise<RelayStatus>`.

- [ ] **Step 1: Add the `RelayStatus` type**

In `packages/types/src/engine.ts`, add:

```ts
export interface RelayStatus {
  running: boolean
  pid?: number
}
```

In `packages/types/src/index.ts`, add `RelayStatus` to the existing `export type { ... } from './engine'` block.

- [ ] **Step 2: Write the failing tests**

Create `apps/client-core/src/relay/__tests__/daemon-status.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { getRelayDaemonStatus } from '../daemon-status'

let aasHome: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-daemon-status-test-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
})

test('returns not running when no pid file exists', async () => {
  const status = await getRelayDaemonStatus(aasHome)
  expect(status).toEqual({ running: false })
})

test('returns running with the pid when the pid file names a live process', async () => {
  await writeFile(join(aasHome, 'relay.pid'), String(process.pid))
  const status = await getRelayDaemonStatus(aasHome)
  expect(status).toEqual({ running: true, pid: process.pid })
})

test('returns not running when the pid file names a dead process', async () => {
  // PID 999999 is exceedingly unlikely to be a live process on any test machine.
  await writeFile(join(aasHome, 'relay.pid'), '999999')
  const status = await getRelayDaemonStatus(aasHome)
  expect(status).toEqual({ running: false })
})

test('returns not running when the pid file contains garbage', async () => {
  await writeFile(join(aasHome, 'relay.pid'), 'not-a-number')
  const status = await getRelayDaemonStatus(aasHome)
  expect(status).toEqual({ running: false })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/client-core && bun test src/relay/__tests__/daemon-status.test.ts`
Expected: FAIL with a module-not-found error for `../daemon-status`.

- [ ] **Step 4: Implement `daemon-status.ts`**

Create `apps/client-core/src/relay/daemon-status.ts`:

```ts
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { RelayStatus } from '@as/types'

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function getRelayDaemonStatus(aasHome: string): Promise<RelayStatus> {
  let pid: number
  try {
    const raw = (await readFile(join(aasHome, 'relay.pid'), 'utf-8')).trim()
    pid = Number(raw)
    if (!Number.isInteger(pid)) return { running: false }
  } catch {
    return { running: false }
  }

  if (!isProcessRunning(pid)) return { running: false }
  return { running: true, pid }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/client-core && bun test src/relay/__tests__/daemon-status.test.ts`
Expected: 4 pass, 0 fail.

- [ ] **Step 6: Add the `AASEngine` method**

In `packages/types/src/engine.ts`, add to the `AASEngine` interface (after `getRecentRequests`, if Task 1 already landed — check the file's current state first and place it sensibly near the other relay-adjacent methods):

```ts
  /** Reports whether the local relay daemon process is currently running. */
  getRelayStatus(): Promise<RelayStatus>
```

In `apps/client-core/src/engine.ts`:
- Add `RelayStatus` to the existing `import type { ... } from '@as/types'` block.
- Add `import { getRelayDaemonStatus } from './relay/daemon-status'`.
- Add this method to `AASEngineImpl`:

```ts
  async getRelayStatus(): Promise<RelayStatus> {
    return getRelayDaemonStatus(this.paths.aasHome)
  }
```

- [ ] **Step 7: Write the failing engine test**

Add to `apps/client-core/src/__tests__/engine.test.ts`:

```ts
test('getRelayStatus reports not running when no daemon pid file exists', async () => {
  const status = await engine.getRelayStatus()
  expect(status).toEqual({ running: false })
})

test('getRelayStatus reports running when the pid file names a live process', async () => {
  const { writeFile } = await import('fs/promises')
  const { join } = await import('path')
  await writeFile(join(aasHome, 'relay.pid'), String(process.pid))

  const status = await engine.getRelayStatus()

  expect(status).toEqual({ running: true, pid: process.pid })
})
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/client-core && bun test src/__tests__/engine.test.ts`
Expected: all pass, including the 2 new tests.

- [ ] **Step 9: Add the RPC dispatch entry**

In `apps/cli/src/commands/rpc.ts`, add to `RPC_METHODS`:

```ts
  getRelayStatus: (e) => e.getRelayStatus(),
```

- [ ] **Step 10: Run the full client-core and cli suites plus type checks**

Run: `cd apps/client-core && bun test && bun run type-check && cd ../cli && bun test && bun run type-check`
Expected: all pass, 0 type errors.

- [ ] **Step 11: Commit**

```bash
git add apps/client-core/src/relay/daemon-status.ts apps/client-core/src/relay/__tests__/daemon-status.test.ts packages/types/src/engine.ts packages/types/src/index.ts apps/client-core/src/engine.ts apps/client-core/src/__tests__/engine.test.ts apps/cli/src/commands/rpc.ts
git commit -m "feat(client-core): add getRelayStatus for read-only relay daemon liveness checks"
```

---

### Task 3: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full monorepo test and type-check suite**

Run: `cd /Users/liushangliang/github/phenix3443/agent-store && bunx turbo run test type-check`
Expected: all tasks pass, 0 failures, 0 type errors.

- [ ] **Step 2: Real-environment sanity check**

```bash
export AS_HOME=$(mktemp -d /tmp/as-dashboard-backend-smoketest-XXXX)
cd /Users/liushangliang/github/phenix3443/agent-store
AS_HOME="$AS_HOME" bun run apps/cli/src/index.ts __rpc getRelayStatus
```

Expected: `{"ok":true,"data":{"running":false}}` (no daemon started in this fresh home).

```bash
AS_HOME="$AS_HOME" bun run apps/cli/src/index.ts __relay-daemon &
echo $! > /tmp/dashboard-backend-daemon.pid
sleep 1
AS_HOME="$AS_HOME" bun run apps/cli/src/index.ts __rpc getRelayStatus
```

Expected: this call reads `{aasHome}/relay.pid` — note the daemon started via `__relay-daemon` directly (not via `aas relay start`) does NOT write a PID file itself (only `apps/cli/src/commands/relay.ts`'s `spawnDetached`+`writePidFile` path does that) — so this specific manual invocation is expected to still report `{"running":false}`, which is correct: `getRelayStatus` is only meaningful when the daemon was started via `aas relay start`. Confirm this expectation holds, then additionally verify the intended real path:

```bash
kill "$(cat /tmp/dashboard-backend-daemon.pid)" 2>/dev/null
AS_HOME="$AS_HOME" bun run apps/cli/src/index.ts relay start
sleep 1
AS_HOME="$AS_HOME" bun run apps/cli/src/index.ts __rpc getRelayStatus
```

Expected: `{"ok":true,"data":{"running":true,"pid":<some number>}}`.

```bash
AS_HOME="$AS_HOME" bun run apps/cli/src/index.ts __rpc getRecentRequests
```

Expected: `{"ok":true,"data":[]}` (no requests logged yet in this fresh home — an empty array, not an error).

- [ ] **Step 3: Tear down**

```bash
AS_HOME="$AS_HOME" bun run apps/cli/src/index.ts relay stop
rm -f /tmp/dashboard-backend-daemon.pid
rm -rf "$AS_HOME"
```

No commit for this task — it's verification only. If any step fails, treat it as `BLOCKED` and report the exact failure rather than silently proceeding.
