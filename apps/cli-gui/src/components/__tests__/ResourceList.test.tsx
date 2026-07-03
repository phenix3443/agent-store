import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { TerminalLogProvider, useTerminalLog } from '../../state/TerminalLog'
import * as rpcModule from '../../lib/rpc'
import { ResourceList } from '../ResourceList'

afterEach(() => { cleanup(); mock.restore() })

const publisher = { id: 'p', slug: 'anthropic', name: 'anthropic', avatarUrl: '', tier: 'official' as const }

const installedList = [
  {
    slug: 'filesystem', category: 'mcp', version: '0.8.1',
    installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    compatibleWith: ['claude', 'codex'], enabledFor: { claude: true, codex: false },
  },
  {
    slug: 'yls', category: 'provider', version: '1.0.0',
    installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    compatibleWith: ['claude'], enabledFor: { claude: true },
  },
]

const infoBySlug: Record<string, unknown> = {
  filesystem: {
    ...installedList[0], name: 'filesystem', description: '读写本地文件系统', readmeUrl: '', icon: '',
    publisher, tags: ['fs'], downloads: 388000,
  },
  yls: {
    ...installedList[1], name: 'yls', description: 'YLS 中转端点', readmeUrl: '', icon: '',
    publisher, tags: [], downloads: 32000,
  },
}

const catalogItem = {
  id: 'i1', slug: 'context7', name: 'context7', description: '文档上下文',
  readmeUrl: '', icon: '', category: 'mcp', version: '1.0.0', publisher,
  compatibleWith: ['claude'], tags: [], downloads: 118000, rating: 4.7,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z', configSchema: {},
}

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) =>
    handlers[method]?.(...args)) as typeof rpcModule.callRpc)
}

function defaultHandlers(overrides?: Record<string, (...args: unknown[]) => unknown>) {
  return {
    list: () => installedList,
    info: (slug: unknown) => infoBySlug[slug as string],
    search: () => [catalogItem],
    ...overrides,
  }
}

function TerminalProbe() {
  const { lines } = useTerminalLog()
  return <div data-testid="log-count">{lines.length}</div>
}

function NavViewProbe() {
  const { setNavView } = useAppState()
  return <button onClick={() => setNavView('updates')}>show-updates</button>
}

async function renderList(handlers?: Record<string, (...args: unknown[]) => unknown>) {
  mockRpc(defaultHandlers(handlers))
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <NavViewProbe />
        <ResourceList />
        <TerminalProbe />
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

test('renders installed and recommended groups', async () => {
  await renderList()
  await waitFor(() => expect(screen.getByText('filesystem')).toBeInTheDocument())
  expect(screen.getByText('yls')).toBeInTheDocument()
  expect(screen.getByText('context7')).toBeInTheDocument()
  expect(screen.getByText('已安装')).toBeInTheDocument()
  expect(screen.getByText('推荐')).toBeInTheDocument()
})

test('typing @ opens the filter token menu; selecting @installed hides the recommended group', async () => {
  await renderList()
  await waitFor(() => screen.getByText('context7'))
  fireEvent.change(screen.getByPlaceholderText('搜索，或用 @ 过滤…'), { target: { value: '@' } })
  fireEvent.click(screen.getByText('@installed · 已安装'))
  expect(screen.queryByText('context7')).not.toBeInTheDocument()
  expect(screen.getByText('filesystem')).toBeInTheDocument()
})

test('plain text filters both groups by name', async () => {
  await renderList()
  await waitFor(() => screen.getByText('context7'))
  fireEvent.change(screen.getByPlaceholderText('搜索，或用 @ 过滤…'), { target: { value: 'context' } })
  expect(screen.queryByText('filesystem')).not.toBeInTheDocument()
  expect(screen.getByText('context7')).toBeInTheDocument()
})

test('clicking 安装 on a recommended item calls install and refreshes', async () => {
  const install = mock(() => ({ version: '1.0.0' }))
  await renderList({ install })
  await waitFor(() => screen.getByText('context7'))
  fireEvent.click(screen.getByText('安装'))
  await waitFor(() => expect(install).toHaveBeenCalledWith('context7'))
  expect(screen.getByTestId('log-count').textContent).not.toBe('0')
})

test('clicking 卸载 on an installed item calls uninstall', async () => {
  const uninstall = mock(() => undefined)
  await renderList({ uninstall })
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.click(screen.getAllByText('卸载')[0])
  await waitFor(() => expect(uninstall).toHaveBeenCalledWith('filesystem'))
})

test('toggling enable for the active agent app calls enable/disable', async () => {
  const disable = mock(() => undefined)
  await renderList({ disable })
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.click(screen.getByLabelText('为 claude 禁用 filesystem'))
  await waitFor(() => expect(disable).toHaveBeenCalledWith('filesystem', 'claude'))
})

test('clicking 复制 on a provider row calls duplicateProvider and logs the new slug', async () => {
  const duplicateProvider = mock(() => ({ newSlug: 'yls-copy' }))
  await renderList({ duplicateProvider })
  await waitFor(() => screen.getByText('yls'))
  fireEvent.click(screen.getByText('复制'))
  await waitFor(() => expect(duplicateProvider).toHaveBeenCalledWith('yls'))
  expect(screen.getByTestId('log-count').textContent).not.toBe('0')
})

test('复制 is not shown for non-provider installed items', async () => {
  await renderList()
  await waitFor(() => screen.getByText('filesystem'))
  const filesystemRow = screen.getByText('filesystem').closest('div')
  expect(filesystemRow?.parentElement?.textContent).not.toContain('复制')
})

test('switching to the updates nav view renders checkUpdates results instead of installed/recommended groups', async () => {
  const checkUpdates = mock(() => [
    { slug: 'filesystem', currentVersion: '0.8.0', latestVersion: '0.8.1' },
  ])
  await renderList({ checkUpdates })
  await waitFor(() => screen.getByText('context7'))
  fireEvent.click(screen.getByText('show-updates'))
  await waitFor(() => expect(checkUpdates).toHaveBeenCalled())
  expect(screen.queryByText('已安装')).not.toBeInTheDocument()
  expect(screen.queryByText('推荐')).not.toBeInTheDocument()
  expect(screen.getByText('filesystem v0.8.0 → v0.8.1')).toBeInTheDocument()
})

test('clicking 全部更新 calls update with no slug argument', async () => {
  const checkUpdates = mock(() => [
    { slug: 'filesystem', currentVersion: '0.8.0', latestVersion: '0.8.1' },
  ])
  const update = mock(() => [])
  await renderList({ checkUpdates, update })
  fireEvent.click(screen.getByText('show-updates'))
  await waitFor(() => screen.getByText('全部更新'))
  fireEvent.click(screen.getByText('全部更新'))
  await waitFor(() => expect(update).toHaveBeenCalledWith())
})

test('clicking a row 更新 button calls update with that row slug', async () => {
  const checkUpdates = mock(() => [
    { slug: 'filesystem', currentVersion: '0.8.0', latestVersion: '0.8.1' },
  ])
  const update = mock(() => [])
  await renderList({ checkUpdates, update })
  fireEvent.click(screen.getByText('show-updates'))
  await waitFor(() => screen.getByText('filesystem v0.8.0 → v0.8.1'))
  fireEvent.click(screen.getByRole('button', { name: '更新' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith('filesystem'))
})

test('zero updates shows the up-to-date message', async () => {
  const checkUpdates = mock(() => [])
  await renderList({ checkUpdates })
  fireEvent.click(screen.getByText('show-updates'))
  await waitFor(() => expect(checkUpdates).toHaveBeenCalled())
  expect(screen.getByText('所有包均为最新')).toBeInTheDocument()
})
