import type { BackupStatus } from '@as/types'
import type { TFn } from '../i18n'
import type { FriendlyError } from './errors'
import { RpcError, errorText } from './rpc'

/** RPC methods that change what the backup holds; auto-sync waits for them and runs after them. */
export const BACKED_UP_METHODS = new Set(['install', 'installAndEnable', 'uninstall', 'enable', 'disable', 'setConfig', 'update', 'duplicateProvider'])

export interface AutoTiming {
  /** Quiet time after the last local change before backing up. */
  debounceMs: number
  /** How often the remote is checked when nothing changed here. */
  remoteCheckMs: number
  /** First remote check after launch. */
  initialDelayMs: number
  /** How often the scheduler looks. */
  pollMs: number
}

// Same debounce and start delay as skills-manager's auto backup (src-tauri/src/core/auto_backup.rs).
export const AUTO_TIMING: AutoTiming = { debounceMs: 120_000, remoteCheckMs: 600_000, initialDelayMs: 90_000, pollMs: 15_000 }

const MAX_BACKOFF_SHIFT = 5

export interface AutoClock {
  dirty: boolean
  lastChangeAt: number
  lastCheckAt: number
  failures: number
  now: number
}

/** What auto-sync should run now: a backup after local changes settle, a remote check on its interval, or nothing. Failures stretch both waits. */
export function autoDue(c: AutoClock, timing: AutoTiming): 'now' | 'check' | null {
  const stretch = 2 ** Math.min(c.failures, MAX_BACKOFF_SHIFT)
  if (c.dirty && c.now - c.lastChangeAt >= timing.debounceMs * stretch) return 'now'
  if (c.now - c.lastCheckAt >= timing.remoteCheckMs * stretch) return 'check'
  return null
}

export type SyncState = 'syncing' | 'error' | 'blocked' | 'conflict' | 'pending' | 'remote' | 'synced' | 'never'

export function syncState(status: BackupStatus, opts: { running: boolean; error: boolean }): SyncState {
  if (opts.running) return 'syncing'
  if (status.secretFindings.length) return 'blocked'
  if (opts.error || status.failed.length) return 'error'
  if (status.conflicts.length) return 'conflict'
  if (status.localChanges.length) return 'pending'
  if (status.remoteAhead) return 'remote'
  return status.lastSync ? 'synced' : 'never'
}

export function isBusyError(err: unknown): boolean {
  return err instanceof RpcError && err.fields.reason === 'busy'
}

const REASON_KEYS: Record<string, string> = {
  busy: 'busy',
  'not-connected': 'notConnected',
  'already-connected': 'alreadyConnected',
  'foreign-repo': 'foreignRepo',
  'unsupported-schema': 'schema',
  'token-needs-https': 'tokenHttps',
  'no-conflict': 'noConflict',
  'no-snapshot': 'noSnapshot',
  ambiguous: 'ambiguous',
  'secret-found': 'secret',
  'export-failed': 'export',
  'apply-failed': 'apply',
  'git-missing': 'gitMissing',
  'auth-failed': 'auth',
  'host-key': 'hostKey',
  'not-found': 'notFound',
  network: 'network',
}

/** What went wrong and what to do next; the engine's own text stays behind 详细信息. */
export function describeBackupError(err: unknown, t: TFn): FriendlyError {
  const raw = errorText(err)
  const key = err instanceof RpcError ? REASON_KEYS[err.fields.reason ?? ''] : undefined
  if (!key) return { message: raw }
  return { message: t(`bk.err.${key}`), detail: raw }
}

const WHAT_KEYS: Record<string, string> = {
  'an Anthropic API key': 'anthropic',
  'an OpenAI-style API key': 'openai',
  'a GitHub token': 'github',
  'an AWS access key id': 'aws',
  'a Slack token': 'slack',
  'a Google API key': 'google',
  'a private key': 'privateKey',
  'the local relay token': 'relayToken',
  'a stored project variable': 'projectVar',
  'the backup token': 'backupToken',
}

/** The secret check names what it found in English; known phrases are translated, the rest is shown as is. */
export function describeFinding(what: string, t: TFn): string {
  const key = WHAT_KEYS[what]
  if (key) return t(`bk.what.${key}`)
  const m = /^the (.+) value of (.+)$/.exec(what)
  if (m) return t('bk.what.value').replace('{0}', m[1]).replace('{1}', m[2])
  return what
}

/** `items/<kind>/<slug>/content/files/SKILL.md` → the item and the path inside it. */
export function splitFindingPath(file: string): { item: string; path: string } {
  const m = /^items\/(skill|mcp|provider)\/([^/]+)\/(.*)$/.exec(file)
  if (!m) return { item: file, path: '' }
  const inner = m[3].replace(/^content\/files\//, '').replace(/^content\//, '')
  return { item: m[2], path: inner }
}

/** Same rule as the core's suffix for 都保留 (apps/client-core/src/backup/service.ts). */
export function deviceSlug(device: string | undefined): string {
  const s = (device ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return s || 'remote'
}

export type SnapshotReason = { kind: 'now' | 'pull' | 'restore' } | { kind: 'resolve'; item: string } | { kind: 'other'; text: string }

/** The core writes the snapshot reason in English (service.ts). */
export function snapshotReason(reason: string): SnapshotReason {
  if (reason === 'Before backing up') return { kind: 'now' }
  if (reason === 'Before pulling') return { kind: 'pull' }
  if (reason.startsWith('Before restoring')) return { kind: 'restore' }
  const m = /^Before resolving (\S+)/.exec(reason)
  if (m) return { kind: 'resolve', item: m[1] }
  return { kind: 'other', text: reason }
}

export function snapshotLabel(reason: string, t: TFn): string {
  const r = snapshotReason(reason)
  if (r.kind === 'other') return r.text
  if (r.kind === 'resolve') return t('bk.snapReason.resolve').replace('{0}', r.item)
  return t(`bk.snapReason.${r.kind}`)
}

/** `<device>: back up 3 items` is the core's commit subject; other subjects are shown as written. */
export function uploadedCount(subject: string): number | null {
  const m = /: back up (\d+) items?$/.exec(subject)
  return m ? Number(m[1]) : null
}

/** For the activity log: a pasted `https://user:token@host/...` loses its credentials. */
export function redactRemote(remote: string): string {
  return remote.replace(/^(https?:\/\/)[^@/]*@/i, '$1')
}

export function isHttpsRemote(remote: string): boolean {
  return /^https?:\/\//i.test(remote.trim())
}

export function formatWhen(iso: string, locale: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}
