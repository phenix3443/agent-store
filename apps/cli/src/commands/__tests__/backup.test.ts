import { test, expect } from 'bun:test'
import type { BackupStatus, BackupSyncResult, Engine } from '@as/types'
import { runBackup, type BackupIo } from '../backup'
import { runRpc } from '../rpc'

type TestIo = BackupIo & { lines: string[]; asked: number }

function io(secret = 'tok-123'): TestIo {
  const o: TestIo = { lines: [], asked: 0, out: s => { o.lines.push(s) }, readSecret: async () => { o.asked++; return secret } }
  return o
}

const engine = (overrides: Partial<Engine>) => overrides as unknown as Engine

const status: BackupStatus = {
  connected: true, remote: 'git@example.com:me/backup.git', branch: 'main', device: 'laptop', connectedAt: '',
  hasCredentials: false, localChanges: [{ key: 'skill/notes', category: 'skill', slug: 'notes' }], remoteAhead: null,
  conflicts: [{ key: 'mcp/db', category: 'mcp', slug: 'db', reason: 'both-changed', parts: ['content'], remoteDevice: 'desktop', detectedAt: '' }],
  missingSecrets: [{ key: 'provider/p', category: 'provider', slug: 'p', targets: ['claude'], reason: 'no-key', message: '' }],
  failed: [], localOnly: [], notRestorable: [], excludedFiles: [], secretFindings: [],
}

test('connect reads the token from stdin and refuses it on the command line', async () => {
  let got: unknown
  const e = engine({ connectBackup: async (o: unknown) => { got = o; return { status, remoteItems: 3 } } })
  const o = io()
  expect(await runBackup(e, ['connect', 'https://example.com/r.git', '--device', 'laptop', '--token-stdin'], o)).toBe(0)
  expect(got).toEqual({ remote: 'https://example.com/r.git', device: 'laptop', token: 'tok-123' })
  expect(o.asked).toBe(1)
  expect(o.lines.join('\n')).toContain('aas backup pull')
  expect(await runBackup(e, ['connect', 'https://example.com/r.git', '--token', 'tok'], io())).toBe(2)
  const empty = io('')
  expect(await runBackup(e, ['connect', 'https://example.com/r.git', '--token-stdin'], empty)).toBe(1)
})

test('status lists local changes, conflicts with the remote device, and missing keys with what to run', async () => {
  const o = io()
  expect(await runBackup(engine({ getBackupStatus: async () => status }), ['status'], o)).toBe(0)
  const text = o.lines.join('\n')
  expect(text).toContain('Local changes: skill/notes')
  expect(text).toContain('mcp/db')
  expect(text).toContain('desktop')
  expect(text).toContain('aas config p')
})

test('now reports what moved, and exits 1 when a remote change could not be applied', async () => {
  const result: BackupSyncResult = {
    pushed: 'abcdef1234567890', uploaded: [{ key: 'skill/notes', category: 'skill', slug: 'notes' }],
    applied: [{ key: 'mcp/db', category: 'mcp', slug: 'db', actions: ['updated', 'enabled'] }], snapshot: '20261114T000000Z',
    conflicts: [], missingSecrets: [], failed: [], localOnly: [], notRestorable: [], excludedFiles: [],
  }
  const o = io()
  expect(await runBackup(engine({ backupNow: async () => result }), ['now'], o)).toBe(0)
  expect(o.lines.join('\n')).toContain('mcp/db: updated, enabled')
  const failing = { ...result, failed: [{ key: 'mcp/db', category: 'mcp' as const, slug: 'db', message: 'boom', at: '' }] }
  expect(await runBackup(engine({ pullBackup: async () => failing }), ['pull'], io())).toBe(1)
})

test('resolve takes a slug and one of local, remote, both', async () => {
  let got: unknown[] = []
  const e = engine({
    resolveBackupConflict: async (...a: unknown[]) => {
      got = a
      return { item: { key: 'mcp/db', category: 'mcp', slug: 'db' }, choice: 'both', keptAs: 'db-desktop', snapshot: 's1', applied: [], missingSecrets: [] }
    },
  })
  const o = io()
  expect(await runBackup(e, ['resolve', 'db', 'both'], o)).toBe(0)
  expect(got).toEqual(['db', 'both'])
  expect(o.lines.join('\n')).toContain('db-desktop')
  expect(o.lines.join('\n')).toContain('aas backup restore s1')
  expect(await runBackup(e, ['resolve', 'db', 'mine'], io())).toBe(2)
})

test('connectBackup over RPC takes its token from the stdin line, not argv', async () => {
  let got: unknown
  const e = engine({ connectBackup: async (o: unknown) => { got = o; return { status, remoteItems: 0 } } })
  const out: string[] = []
  const line = JSON.stringify([{ remote: 'https://h/r.git', token: 'secret-tok' }])
  expect(await runRpc(e, ['connectBackup', '-'], s => out.push(s), async () => line)).toBe(0)
  expect(got).toEqual({ remote: 'https://h/r.git', token: 'secret-tok' })
  expect(JSON.parse(out[0]).ok).toBe(true)
})
