import { test, expect, afterEach, beforeEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import type { BackupStatus } from '@as/types'
import * as rpcModule from '../../lib/rpc'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { BackupProvider } from '../../state/Backup'
import { TerminalLogProvider, useTerminalLog } from '../../state/TerminalLog'
import { BackupTab } from '../backup/BackupTab'
import { BackupDialogs } from '../backup/BackupDialogs'
import { BackupIndicator } from '../backup/BackupIndicator'
import { settleRpc } from '../../test/settle'

beforeEach(() => { try { localStorage.setItem('as-locale', 'zh') } catch { /* ignore */ } })
afterEach(async () => { cleanup(); await settleRpc(); mock.restore() })

const NEVER = { debounceMs: 1e9, remoteCheckMs: 1e9, initialDelayMs: 1e9, pollMs: 1e9 }

const empty: BackupStatus = {
  connected: false, localChanges: [], remoteAhead: null, conflicts: [], missingSecrets: [], failed: [], localOnly: [],
  notRestorable: [], excludedFiles: [], secretFindings: [],
}

const connected = (over: Partial<BackupStatus> = {}): BackupStatus => ({
  ...empty,
  connected: true,
  remote: '/srv/backup.git',
  branch: 'main',
  device: 'desk-a',
  connectedAt: '2026-11-14T08:00:00Z',
  lastSync: { commit: 'abc', at: '2026-11-14T09:00:00Z' },
  ...over,
})

const notes = { key: 'skill/notes', category: 'skill' as const, slug: 'notes' }
const syncResult = { pushed: 'c1', uploaded: [notes], applied: [], snapshot: '20261114T090000Z', conflicts: [], missingSecrets: [], failed: [], localOnly: [], notRestorable: [], excludedFiles: [] }

type H = Record<string, (...args: unknown[]) => unknown>
function mockRpc(handlers: H) {
  const calls: { method: string; args: unknown[] }[] = []
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push({ method, args })
    const h = handlers[method] ?? ({ listBackupSnapshots: () => [], listBackupHistory: () => [] } as H)[method]
    if (!h) throw new Error(`unexpected RPC: ${method}`)
    return h(...args)
  }) as typeof rpcModule.callRpc)
  return calls
}

function Probe() {
  const { navView, categoryFilter, selectedSlug } = useAppState()
  const { lines } = useTerminalLog()
  return <div data-testid="probe">{`${navView}:${categoryFilter}:${selectedSlug ?? '-'}|${lines.map((l) => l.text).join('\n')}`}</div>
}

function renderTab() {
  render(
    <AppStateProvider>
      <TerminalLogProvider>
        <BackupProvider timing={NEVER}>
          <BackupTab />
          <BackupDialogs />
          <BackupIndicator />
          <Probe />
        </BackupProvider>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

test('not connected: offers a new backup or a restore, and says what is and is not uploaded', async () => {
  mockRpc({ getBackupStatus: () => empty })
  renderTab()
  expect(await screen.findByRole('button', { name: '连接仓库…' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /从备份恢复/ })).toBeInTheDocument()
  expect(screen.getByText(/供应商的 API 密钥和令牌/)).toBeInTheDocument()
  expect(screen.getByText(/不经过 Agent Store 的服务器/)).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/云端/)
  expect(screen.queryByRole('button', { name: /^备份：/ })).toBeNull()
})

test('connecting checks the form, passes the token only as an RPC argument, then offers the first backup', async () => {
  let status = empty
  const calls = mockRpc({
    getBackupStatus: () => status,
    connectBackup: () => {
      status = connected({ lastSync: undefined, hasCredentials: true, remote: 'https://git.example/me/b.git' })
      return { status, remoteItems: 0 }
    },
    backupNow: () => {
      status = connected({ remote: 'https://git.example/me/b.git', hasCredentials: true })
      return syncResult
    },
  })
  renderTab()
  fireEvent.click(await screen.findByRole('button', { name: '连接仓库…' }))
  const dialog = await screen.findByRole('dialog')
  const remote = within(dialog).getByLabelText('仓库地址')
  await waitFor(() => expect(document.activeElement === remote).toBe(true))

  fireEvent.click(within(dialog).getByRole('button', { name: '连接' }))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('请填写仓库地址')

  fireEvent.change(remote, { target: { value: 'git@git.example:me/b.git' } })
  const token = within(dialog).getByLabelText('访问令牌')
  expect(token).toHaveAttribute('type', 'password')
  fireEvent.change(token, { target: { value: 'tok-123456789' } })
  fireEvent.click(within(dialog).getByRole('button', { name: '连接' }))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('令牌只用于 https:// 地址')
  expect(calls.some((c) => c.method === 'connectBackup')).toBe(false)

  fireEvent.change(remote, { target: { value: 'https://git.example/me/b.git' } })
  fireEvent.change(within(dialog).getByLabelText('设备名'), { target: { value: 'desk-a' } })
  fireEvent.click(within(dialog).getByRole('button', { name: '连接' }))
  expect(await within(dialog).findByText('已连接')).toBeInTheDocument()
  expect(calls.find((c) => c.method === 'connectBackup')?.args).toEqual([{ remote: 'https://git.example/me/b.git', device: 'desk-a', token: 'tok-123456789' }])
  expect(screen.getByTestId('probe').textContent).toContain('$ aas backup connect https://git.example/me/b.git --device desk-a --token-stdin')
  expect(screen.getByTestId('probe').textContent).not.toContain('tok-123456789')

  const now = within(dialog).getByRole('button', { name: '立即备份' })
  await waitFor(() => expect(document.activeElement === now).toBe(true))
  fireEvent.click(now)
  await waitFor(() => expect(calls.some((c) => c.method === 'backupNow')).toBe(true))
  expect(await screen.findByText('备份完成：上传 1 项，从远端应用 0 项。')).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: '备份：已同步' })).toBeInTheDocument()
  expect(screen.getByText('令牌已存在本机')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('tok-123456789')
})

test('a connected remote that already holds items offers restore first when restoring', async () => {
  let status = empty
  const calls = mockRpc({
    getBackupStatus: () => status,
    connectBackup: () => {
      status = connected({ lastSync: undefined })
      return { status, remoteItems: 4 }
    },
    pullBackup: () => ({ ...syncResult, uploaded: [], applied: [{ ...notes, actions: ['installed'] }] }),
  })
  renderTab()
  fireEvent.click(await screen.findByRole('button', { name: /从备份恢复/ }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('连接存有备份的仓库')).toBeInTheDocument()
  fireEvent.change(within(dialog).getByLabelText('仓库地址'), { target: { value: '/srv/backup.git' } })
  fireEvent.click(within(dialog).getByRole('button', { name: '连接' }))
  expect(await within(dialog).findByText('仓库里已有 4 项备份。')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: '恢复到本机' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'pullBackup')).toBe(true))
  expect(await screen.findByText(/从远端应用：notes（安装）/)).toBeInTheDocument()
})

test('connect failures say what to do next', async () => {
  mockRpc({
    getBackupStatus: () => empty,
    connectBackup: () => {
      throw new rpcModule.RpcError("git ls-remote failed: fatal: Authentication failed for 'https://git.example/me/b.git/'", 'GitError', { reason: 'auth-failed' })
    },
  })
  renderTab()
  fireEvent.click(await screen.findByRole('button', { name: '连接仓库…' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('仓库地址'), { target: { value: 'https://git.example/me/b.git' } })
  fireEvent.click(within(dialog).getByRole('button', { name: '连接' }))
  expect(await within(dialog).findByText(/认证失败，远端拒绝了访问/)).toBeInTheDocument()
  expect(within(dialog).getByText('连接失败')).toBeInTheDocument()
})

test('the status page lists conflicts, missing keys, a found secret and what stays local', async () => {
  mockRpc({
    getBackupStatus: () =>
      connected({
        localChanges: [notes],
        conflicts: [{ ...notes, reason: 'both-changed', parts: ['content'], remoteDevice: 'laptop-b', detectedAt: '' }],
        missingSecrets: [{ key: 'provider/openrouter', category: 'provider', slug: 'openrouter', targets: ['claude'], reason: 'no-key', message: '' }],
        secretFindings: [{ file: 'items/skill/legacy/content/files/SKILL.md', what: 'a GitHub token' }],
        localOnly: [{ key: 'skill/big', category: 'skill', slug: 'big', reason: 'too-large', bytes: 150 * 1024 * 1024 }],
      }),
  })
  renderTab()
  const conflicts = await screen.findByRole('region', { name: '待处理的冲突' })
  expect(conflicts).toHaveTextContent('两边都改过')
  expect(conflicts).toHaveTextContent('不同之处：内容')
  expect(screen.getByRole('region', { name: '缺少密钥' })).toHaveTextContent('没有 API 密钥 · 备份里对 Claude Code 启用')
  expect(screen.getByText('legacy 的 SKILL.md：GitHub 令牌')).toBeInTheDocument()
  expect(screen.getByText('big 有 150 MB，超过 100 MB，只留在本机')).toBeInTheDocument()
  expect(screen.getByTestId('backup-state')).toHaveTextContent('发现疑似密钥')
  expect(screen.getByText(/待上传：notes/)).toBeInTheDocument()

  fireEvent.click(within(screen.getByRole('region', { name: '缺少密钥' })).getByRole('button', { name: '去填写' }))
  expect(screen.getByTestId('probe').textContent).toMatch(/^browse:provider:openrouter\|/)
})

test('resolving a conflict explains each choice, names the copy for 都保留 and sends the choice', async () => {
  const calls = mockRpc({
    getBackupStatus: () => connected({ conflicts: [{ ...notes, reason: 'both-changed', parts: ['content', 'state'], remoteDevice: 'Laptop B', detectedAt: '' }] }),
    resolveBackupConflict: () => ({ item: notes, choice: 'both', keptAs: 'notes-laptop-b', snapshot: 's1', applied: [], missingSecrets: [] }),
  })
  renderTab()
  const conflicts = await screen.findByRole('region', { name: '待处理的冲突' })
  fireEvent.click(within(conflicts).getByRole('button', { name: '处理…' }))
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent('处理冲突：notes')
  expect(dialog).toHaveTextContent('远端的版本另装为 notes-laptop-b，不对任何 agent 启用')
  expect(dialog).toHaveTextContent('先为本机当前状态存一个快照')
  const confirm = within(dialog).getByRole('button', { name: '确定' })
  expect(confirm).toBeDisabled()
  fireEvent.click(within(dialog).getByRole('radio', { name: /两份都保留/ }))
  fireEvent.click(confirm)
  await waitFor(() => expect(calls.find((c) => c.method === 'resolveBackupConflict')?.args).toEqual(['skill/notes', 'both']))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

test('a conflict where one side removed the item offers no 都保留', async () => {
  mockRpc({ getBackupStatus: () => connected({ conflicts: [{ ...notes, reason: 'deleted-there', parts: ['content'], remoteDevice: 'laptop-b', detectedAt: '' }] }) })
  renderTab()
  fireEvent.click(within(await screen.findByRole('region', { name: '待处理的冲突' })).getByRole('button', { name: '处理…' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getAllByRole('radio')).toHaveLength(2)
  expect(dialog).toHaveTextContent('远端已卸载它，本机也会卸载。')
})

test('restoring a snapshot confirms first and says a snapshot of the current state is taken', async () => {
  const calls = mockRpc({
    getBackupStatus: () => connected(),
    listBackupSnapshots: () => [{ id: '20261114T090000Z', createdAt: '2026-11-14T09:00:00Z', reason: 'Before resolving skill/notes (both)' }],
    restoreBackupSnapshot: () => ({ snapshot: 's2', applied: [], missingSecrets: [], failed: [], notRestorable: [] }),
  })
  renderTab()
  const snapshots = await screen.findByRole('region', { name: '快照' })
  expect(await within(snapshots).findByText(/处理 skill\/notes 之前/)).toBeInTheDocument()
  fireEvent.click(within(snapshots).getByRole('button', { name: '恢复…' }))
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent('恢复之前先为当前状态存一个快照')
  await waitFor(() => expect(document.activeElement === within(dialog).getByRole('button', { name: '取消' })).toBe(true))
  fireEvent.click(within(dialog).getByRole('button', { name: '恢复' }))
  await waitFor(() => expect(calls.find((c) => c.method === 'restoreBackupSnapshot')?.args).toEqual(['20261114T090000Z']))
})

test('history names the device of each commit', async () => {
  mockRpc({
    getBackupStatus: () => connected(),
    listBackupHistory: () => [
      { commit: 'c2c2c2c2c2c2', device: 'laptop-b', at: '2026-11-14T10:00:00Z', subject: 'laptop-b: back up 2 items' },
      { commit: 'c1c1c1c1c1c1', device: 'desk-a', at: '2026-11-14T09:00:00Z', subject: 'desk-a: back up 5 items' },
    ],
  })
  renderTab()
  const history = await screen.findByRole('region', { name: '同步记录' })
  expect(await within(history).findByText('laptop-b')).toBeInTheDocument()
  expect(history).toHaveTextContent('上传 2 项')
  expect(history).toHaveTextContent('本机')
})

test('disconnecting confirms that only this machine is disconnected', async () => {
  let status = connected()
  const calls = mockRpc({
    getBackupStatus: () => status,
    disconnectBackup: () => {
      status = empty
    },
  })
  renderTab()
  fireEvent.click(await screen.findByRole('button', { name: '断开…' }))
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent('远端仓库和里面的备份，其他设备照常使用')
  expect(dialog).toHaveTextContent('本机已安装的技能、MCP 和供应商')
  fireEvent.click(within(dialog).getByRole('button', { name: '断开' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'disconnectBackup')).toBe(true))
  expect(await screen.findByRole('button', { name: '连接仓库…' })).toBeInTheDocument()
})

test('a failed backup shows the reason on the page', async () => {
  mockRpc({
    getBackupStatus: () => connected(),
    backupNow: () => {
      throw new rpcModule.RpcError('git fetch failed: Could not resolve host: git.example', 'GitError', { reason: 'network' })
    },
  })
  renderTab()
  fireEvent.click(await screen.findByRole('button', { name: /立即备份/ }))
  expect(await screen.findByText('备份失败')).toBeInTheDocument()
  expect(screen.getByText(/连不上远端/)).toBeInTheDocument()
})
