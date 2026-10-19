import { Database } from 'bun:sqlite'
import { join } from 'path'
import { mkdirSync } from 'fs'

export function openUsageDb(aasHome: string): Database {
  mkdirSync(aasHome, { recursive: true })
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

  // Per-provider circuit-breaker state, updated from real request outcomes.
  // Shared on disk so the relay daemon writes it and the RPC process reads it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_health (
      provider_slug TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'up',
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      cooldown_until INTEGER,
      last_error_kind TEXT,
      last_status INTEGER,
      last_error_at TEXT,
      updated_at TEXT NOT NULL
    )
  `)

  return db
}
