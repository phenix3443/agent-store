import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { Command } from '@tauri-apps/plugin-shell'
import { callRpc } from '../../lib/rpc'
import { AppStateProvider } from '../AppState'
import { BackupProvider } from '../Backup'
import { TerminalLogProvider } from '../TerminalLog'
import { BackupIndicator } from '../../components/backup/BackupIndicator'
import { settleRpc } from '../../test/settle'

afterEach(async () => {
  cleanup()
  await settleRpc()
  mock.restore()
})

type Listener = (arg: never) => void
class Emitter {
  private listeners: Record<string, Listener[]> = {}
  on(event: string, fn: Listener) { (this.listeners[event] ??= []).push(fn); return this }
  emit(event: string, arg: unknown) { for (const fn of this.listeners[event] ?? []) (fn as (a: unknown) => void)(arg) }
}

type Reply = { data: unknown } | { error: string; code?: string; reason?: string }

/** The real callRpc against a fake sidecar, so the auto-sync sees every call start and end. */
function mockSidecar(handler: (method: string) => Reply | Promise<Reply>) {
  const methods: string[] = []
  spyOn(Command, 'sidecar').mockImplementation(((_bin: string, argv: string[]) => {
    const method = argv[1]
    methods.push(method)
    const command = Object.assign(new Emitter(), { stdout: new Emitter(), stderr: new Emitter() })
    return Object.assign(command, {
      spawn: async () => ({
        pid: 1,
        write: async () => {
          void Promise.resolve(handler(method)).then((r) => {
            const env = 'data' in r ? { ok: true, data: r.data } : { ok: false, ...r }
            command.stdout.emit('data', JSON.stringify(env))
            command.emit('close', { code: 0, signal: null })
          })
        },
      }),
    })
  }) as unknown as typeof Command.sidecar)
  return methods
}

const status = {
  connected: true, remote: '/srv/b.git', branch: 'main', device: 'desk-a', lastSync: { commit: 'c', at: '2026-11-14T09:00:00Z' },
  localChanges: [], remoteAhead: 0, conflicts: [], missingSecrets: [], failed: [], localOnly: [], notRestorable: [], excludedFiles: [], secretFindings: [],
}
const result = { pushed: null, uploaded: [], applied: [], snapshot: 's', conflicts: [], missingSecrets: [], failed: [], localOnly: [], notRestorable: [], excludedFiles: [] }

function renderProvider(timing: { debounceMs: number; remoteCheckMs: number; initialDelayMs: number; pollMs: number }) {
  render(
    <AppStateProvider>
      <TerminalLogProvider>
        <BackupProvider timing={timing}>
          <BackupIndicator />
        </BackupProvider>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('a local change is backed up after the quiet period, never while an install is still running', async () => {
  let finishInstall: () => void = () => {}
  const methods = mockSidecar((m) => {
    if (m === 'getBackupStatus') return { data: status }
    if (m === 'backupNow') return { data: result }
    if (m === 'install') return new Promise<Reply>((r) => { finishInstall = () => r({ data: {} }) })
    throw new Error(`unexpected ${m}`)
  })
  renderProvider({ debounceMs: 40, remoteCheckMs: 1e9, initialDelayMs: 1e9, pollMs: 10 })
  await screen.findByRole('button', { name: '备份：已同步' })
  const install = callRpc('install', ['notes'])
  await sleep(150)
  expect(methods).not.toContain('backupNow')
  finishInstall()
  await install
  await waitFor(() => expect(methods.filter((m) => m === 'backupNow')).toHaveLength(1), { timeout: 2000 })
})

test('the periodic check pulls when the remote is ahead', async () => {
  let checks = 0
  const calls = mockSidecar((m) => {
    if (m === 'getBackupStatus') return { data: { ...status, remoteAhead: checks++ >= 1 ? 2 : 0 } }
    if (m === 'pullBackup') return { data: result }
    throw new Error(`unexpected ${m}`)
  })
  renderProvider({ debounceMs: 1e9, remoteCheckMs: 30, initialDelayMs: 0, pollMs: 10 })
  await waitFor(() => expect(calls).toContain('pullBackup'), { timeout: 2000 })
  expect(calls).not.toContain('backupNow')
})

test('a failed automatic sync shows only in the indicator; a busy lock is not a failure', async () => {
  let reason = 'busy'
  const methods = mockSidecar((m) => {
    if (m === 'getBackupStatus') return { data: { ...status, localChanges: [{ key: 'skill/a', category: 'skill', slug: 'a' }] } }
    if (m === 'backupNow') return { error: 'nope', code: reason === 'busy' ? 'BackupBusyError' : 'GitError', reason }
    throw new Error(`unexpected ${m}`)
  })
  renderProvider({ debounceMs: 1e9, remoteCheckMs: 20, initialDelayMs: 0, pollMs: 10 })
  await waitFor(() => expect(methods.filter((m) => m === 'backupNow').length).toBeGreaterThan(2), { timeout: 2000 })
  expect(screen.getByRole('button', { name: /^备份：/ }).textContent).not.toBe('备份：同步出错')
  reason = 'network'
  await waitFor(() => expect(screen.getByRole('button', { name: /^备份：/ }).textContent).toBe('备份：同步出错'), { timeout: 3000 })
})
