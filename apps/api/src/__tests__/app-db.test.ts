import { afterEach, beforeEach, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database as Sqlite } from 'bun:sqlite'
import { eq } from 'drizzle-orm'
import { getDb, openAppDb } from '../db/client'
import { processedWebhooks, subscriptions } from '../db/schema'
import { migrateAppDb } from '../migrate'
import { snapshotAppDb } from '../snapshot'
import { getPlanByEmail, isWebhookProcessed, recordWebhook } from '../subscription-queries'
import type { SubscriptionRecord } from '../billing'

const apiDir = join(import.meta.dir, '../..')
let dir: string
let dbPath: string
let env: { APP_DB_PATH: string }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'app-db-'))
  dbPath = join(dir, 'data', 'app.db')
  env = { APP_DB_PATH: dbPath }
  migrateAppDb(dbPath)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function record(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    waffoOrderId: 'ORD_1',
    buyerEmail: 'Buyer@Example.com',
    buyerIdentity: null,
    plan: 'pro',
    status: 'active',
    productName: null,
    storeId: 'STO_TEST',
    mode: 'test',
    eventTimestamp: '2026-11-01T00:00:00.000Z',
    billingPeriod: null,
    currentPeriodEnd: null,
    ...overrides,
  }
}

function count(path: string, table: string): number {
  const sqlite = new Sqlite(path, { readonly: true })
  try {
    return (sqlite.query(`select count(*) as n from "${table}"`).get() as { n: number }).n
  } finally {
    sqlite.close()
  }
}

test('migrate creates the file in WAL mode with every table, and running it again is a no-op', () => {
  migrateAppDb(dbPath)
  const sqlite = new Sqlite(dbPath, { readonly: true })
  const { journal_mode } = sqlite.query('PRAGMA journal_mode').get() as { journal_mode: string }
  const tables = (sqlite.query("select name from sqlite_schema where type = 'table'").all() as { name: string }[])
    .map((t) => t.name)
  sqlite.close()
  expect(journal_mode).toBe('wal')
  for (const t of ['user', 'session', 'account', 'verification', 'jwks', 'deviceCode', 'subscriptions', 'processed_webhooks']) {
    expect(tables).toContain(t)
  }
})

test('the API refuses to create a missing app.db', () => {
  const missing = join(dir, 'missing.db')
  expect(() => getDb({ APP_DB_PATH: missing })).toThrow('app.db not found')
  expect(existsSync(missing)).toBe(false)
})

test('connections enforce foreign keys', () => {
  const sqlite = openAppDb(dbPath)
  const insertOrphan = () =>
    sqlite
      .query(
        `insert into session (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
         values ('s1', '2026-12-01T00:00:00.000Z', 't1', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z', 'nobody')`,
      )
      .run()
  expect(insertOrphan).toThrow('FOREIGN KEY')
  sqlite.close()
})

test('the same webhook delivered twice is applied once', async () => {
  await Promise.all([
    recordWebhook(env, 'delivery-1', 'subscription.activated', record()),
    recordWebhook(env, 'delivery-1', 'subscription.activated', record()),
  ])
  const db = getDb(env)
  expect(db.select().from(processedWebhooks).all()).toHaveLength(1)
  expect(db.select().from(subscriptions).where(eq(subscriptions.waffoOrderId, 'ORD_1')).all()).toHaveLength(1)
  expect(await isWebhookProcessed(env, 'delivery-1')).toBe(true)
  expect(await isWebhookProcessed(env, 'delivery-2')).toBe(false)
})

test('a stale event does not overwrite a newer one, and lookups ignore email case', async () => {
  await recordWebhook(env, 'd-cancel', 'subscription.canceled', record({
    status: 'canceled',
    eventTimestamp: '2026-11-02T00:00:00.000Z',
  }))
  await recordWebhook(env, 'd-late', 'subscription.activated', record({
    status: 'active',
    eventTimestamp: '2026-11-01T00:00:00.000Z',
  }))
  const row = getDb(env).select().from(subscriptions).get()
  expect(row?.status).toBe('canceled')
  expect(row?.eventTimestamp).toEqual(new Date('2026-11-02T00:00:00.000Z'))
  expect(await getPlanByEmail(env, 'buyer@example.com')).toBe('free')
})

test('a snapshot is a readable copy with the same rows, and never overwrites a file', async () => {
  for (let i = 0; i < 20; i++) {
    await recordWebhook(env, `d${i}`, 'subscription.activated', record({ waffoOrderId: `ORD_${i}` }))
  }
  const out = join(dir, 'snap.db')
  snapshotAppDb(dbPath, out)

  const copy = new Sqlite(out, { readonly: true })
  const integrity = copy.query('PRAGMA integrity_check').get() as { integrity_check: string }
  copy.close()
  expect(integrity.integrity_check).toBe('ok')
  expect(count(out, 'subscriptions')).toBe(count(dbPath, 'subscriptions'))
  expect(count(out, 'processed_webhooks')).toBe(20)

  expect(() => snapshotAppDb(dbPath, out)).toThrow('already exists')
})

test('the snapshot command exits 0 on success and non-zero on failure', () => {
  const run = (...args: string[]) =>
    Bun.spawnSync(['bun', 'src/snapshot.ts', ...args], {
      cwd: apiDir,
      env: { ...process.env, APP_DB_PATH: dbPath },
    }).exitCode
  const out = join(dir, 'cli-snap.db')
  expect(run(out)).toBe(0)
  expect(existsSync(out)).toBe(true)
  expect(run(out)).not.toBe(0) // output already exists
  expect(run()).not.toBe(0) // no output path
})

test('the store and the API write to app.db at the same time without SQLITE_BUSY', async () => {
  const minStoreWrites = 300
  const overlap = 50
  const store = Bun.spawn(
    [
      'node',
      '--no-warnings',
      '--experimental-strip-types',
      join(import.meta.dir, 'fixtures/store-writer.mjs'),
      dbPath,
      String(minStoreWrites),
      String(overlap),
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  const reader = store.stdout.getReader()
  const decoder = new TextDecoder()
  let stdout = ''
  while (!stdout.includes('ready\n')) {
    const { value, done } = await reader.read()
    if (done) break
    stdout += decoder.decode(value)
  }

  // Write as the API until the store is done. Yielding each round lets the exit
  // event through; bun:sqlite calls themselves are synchronous. The 1 ms pause
  // is the gap real traffic has; see fixtures/store-writer.mjs.
  let exited = false
  void store.exited.then(() => (exited = true))
  let apiWrites = 0
  const deadline = Date.now() + 60_000
  while (!exited && Date.now() < deadline) {
    await recordWebhook(env, `race-${apiWrites}`, 'subscription.activated', record({ waffoOrderId: `RACE_${apiWrites}` }))
    apiWrites++
    await Bun.sleep(1)
  }

  const exitCode = await store.exited
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    stdout += decoder.decode(value)
  }
  const stderr = await new Response(store.stderr).text()
  expect(stderr).not.toContain('SQLITE_BUSY')
  expect(stderr).not.toContain('database is locked')
  expect(exitCode).toBe(0)

  // The store saw rows the API committed while its own writes were running.
  const { writes, sawApiWrites } = JSON.parse(stdout.trim().split('\n').pop()!) as {
    writes: number
    sawApiWrites: number
  }
  expect(sawApiWrites).toBeGreaterThanOrEqual(overlap)
  expect(writes).toBeGreaterThanOrEqual(minStoreWrites)
  expect(count(dbPath, 'user')).toBe(writes)
  expect(count(dbPath, 'session')).toBe(writes)
  expect(count(dbPath, 'processed_webhooks')).toBe(apiWrites)
}, 90_000)
