import { test, expect } from 'bun:test'
import type { BackupStatus } from '@as/types'
import { messages } from '../../i18n/messages'
import {
  AUTO_TIMING, autoDue, describeBackupError, describeFinding, deviceSlug, redactRemote, snapshotReason, splitFindingPath, syncState,
  uploadedCount,
} from '../backup'
import { RpcError } from '../rpc'

const zh = (key: string) => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], messages.zh) as string

const status = (over: Partial<BackupStatus> = {}): BackupStatus => ({
  connected: true, localChanges: [], remoteAhead: null, conflicts: [], missingSecrets: [], failed: [], localOnly: [],
  notRestorable: [], excludedFiles: [], secretFindings: [], ...over,
})

const timing = { debounceMs: 100, remoteCheckMs: 1000, initialDelayMs: 0, pollMs: 10 }

test('auto-sync backs up once local changes have been quiet for the debounce, and checks the remote on its interval', () => {
  const base = { dirty: true, lastChangeAt: 1000, lastCheckAt: 1000, failures: 0 }
  expect(autoDue({ ...base, now: 1050 }, timing)).toBeNull()
  expect(autoDue({ ...base, now: 1100 }, timing)).toBe('now')
  expect(autoDue({ ...base, dirty: false, now: 1999 }, timing)).toBeNull()
  expect(autoDue({ ...base, dirty: false, now: 2000 }, timing)).toBe('check')
})

test('failures stretch the waits, up to 32 times', () => {
  const base = { dirty: true, lastChangeAt: 0, lastCheckAt: 0 }
  expect(autoDue({ ...base, failures: 2, now: 399 }, timing)).toBeNull()
  expect(autoDue({ ...base, failures: 2, now: 400 }, timing)).toBe('now')
  expect(autoDue({ ...base, failures: 9, now: 3199 }, timing)).toBeNull()
  expect(autoDue({ ...base, failures: 9, now: 3200 }, timing)).toBe('now')
})

test('the default timing follows skills-manager: two minutes of quiet, first round after 90 s', () => {
  expect(AUTO_TIMING.debounceMs).toBe(120_000)
  expect(AUTO_TIMING.initialDelayMs).toBe(90_000)
})

test('the indicator state puts a running sync, a found secret and errors before conflicts and pending changes', () => {
  const item = { key: 'skill/a', category: 'skill' as const, slug: 'a' }
  const conflict = { ...item, reason: 'both-changed' as const, parts: ['content' as const], detectedAt: '' }
  expect(syncState(status({ conflicts: [conflict] }), { running: true, error: false })).toBe('syncing')
  expect(syncState(status({ secretFindings: [{ file: 'x', what: 'y' }] }), { running: false, error: true })).toBe('blocked')
  expect(syncState(status({ conflicts: [conflict] }), { running: false, error: true })).toBe('error')
  expect(syncState(status({ conflicts: [conflict], localChanges: [item] }), { running: false, error: false })).toBe('conflict')
  expect(syncState(status({ localChanges: [item] }), { running: false, error: false })).toBe('pending')
  expect(syncState(status({ remoteAhead: 2 }), { running: false, error: false })).toBe('remote')
  expect(syncState(status({ lastSync: { commit: 'c', at: '' } }), { running: false, error: false })).toBe('synced')
  expect(syncState(status(), { running: false, error: false })).toBe('never')
})

test('backup errors become what to do next, keeping the engine text as detail', () => {
  const auth = new RpcError('git ls-remote failed: Authentication failed', 'GitError', { reason: 'auth-failed' })
  expect(describeBackupError(auth, zh)).toEqual({ message: zh('bk.err.auth'), detail: auth.message })
  expect(describeBackupError(new RpcError('x', 'GitError', { reason: 'network' }), zh).message).toContain('连不上远端')
  expect(describeBackupError(new RpcError('x', 'BackupRemoteRefusedError', { reason: 'foreign-repo' }), zh).message).toContain('不是一份可用的 Agent Store 备份')
  expect(describeBackupError(new RpcError('x', 'BackupBusyError', { reason: 'busy' }), zh).message).toContain('aas backup')
  expect(describeBackupError(new RpcError('plain', 'Error'), zh)).toEqual({ message: 'plain' })
})

test('secret findings name the item and the file, in the reader’s language', () => {
  expect(splitFindingPath('items/skill/notes/content/files/docs/key.md')).toEqual({ item: 'notes', path: 'docs/key.md' })
  expect(splitFindingPath('items/mcp/ctx/content/item.json')).toEqual({ item: 'ctx', path: 'item.json' })
  expect(describeFinding('a GitHub token', zh)).toBe('GitHub 令牌')
  expect(describeFinding('the apiKey value of provider/openrouter', zh)).toBe('provider/openrouter 的 apiKey 值')
  expect(describeFinding('something new', zh)).toBe('something new')
})

test('the 都保留 slug, snapshot reasons and commit subjects follow what the core writes', () => {
  expect(deviceSlug('Desk B (Linux)')).toBe('desk-b-linux')
  expect(deviceSlug(undefined)).toBe('remote')
  expect(snapshotReason('Before backing up')).toEqual({ kind: 'now' })
  expect(snapshotReason('Before resolving skill/notes (both)')).toEqual({ kind: 'resolve', item: 'skill/notes' })
  expect(snapshotReason('Before restoring 20261114T010203Z')).toEqual({ kind: 'restore' })
  expect(uploadedCount('laptop: back up 3 items')).toBe(3)
  expect(uploadedCount('laptop: back up 1 item')).toBe(1)
  expect(uploadedCount('Initial commit')).toBeNull()
})

test('a pasted token never reaches the activity log', () => {
  expect(redactRemote('https://me:ghp_secret@github.com/me/b.git')).toBe('https://github.com/me/b.git')
  expect(redactRemote('git@github.com:me/b.git')).toBe('git@github.com:me/b.git')
})

test('a run that only found conflicts says so instead of "nothing to sync"', async () => {
  const { syncSummary } = await import('../../components/backup/actions')
  const base = { pushed: null, uploaded: [], applied: [], snapshot: 's', conflicts: [], missingSecrets: [], failed: [], localOnly: [], notRestorable: [], excludedFiles: [] }
  const conflict = { key: 'skill/a', category: 'skill' as const, slug: 'a', reason: 'both-changed' as const, parts: ['content' as const], detectedAt: '' }
  expect(syncSummary('now', base, zh)).toBe(zh('bk.resultNothing'))
  expect(syncSummary('now', { ...base, conflicts: [conflict] }, zh)).toBe('有 1 项冲突待处理，其余内容已经一致。')
})
