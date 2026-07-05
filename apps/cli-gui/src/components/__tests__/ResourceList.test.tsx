import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { useEffect } from 'react'
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

const providerCatalogItem = {
  id: 'i2', slug: 'test-provider', name: 'test-provider', description: '测试供应商',
  readmeUrl: '', icon: '', category: 'provider', version: '1.0.0', publisher,
  compatibleWith: ['claude'], tags: [], downloads: 0, rating: 0,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z', configSchema: {},
}

const providerTreeList = [
  {
    slug: 'test-provider', category: 'provider', version: '1.0.0',
    installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    compatibleWith: ['claude'], enabledFor: { claude: true },
  },
  {
    slug: 'test-provider-copy', category: 'provider', version: '1.0.0',
    installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    compatibleWith: ['claude'], enabledFor: { claude: true }, parentSlug: 'test-provider',
  },
]

const providerTreeInfoBySlug: Record<string, unknown> = {
  'test-provider': {
    ...providerTreeList[0], name: 'test-provider', description: '测试供应商', readmeUrl: '', icon: '',
    publisher, tags: [], downloads: 0,
  },
  'test-provider-copy': {
    ...providerTreeList[1], name: 'test-provider-copy', description: '测试供应商', readmeUrl: '', icon: '',
    publisher, tags: [], downloads: 0,
  },
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
    checkUpdates: () => [],
    listLocalConfigs: () => [],
    getRelayStatus: () => ({ running: false }),
    addLocalConfig: () => ({ id: 'new', name: '新配置', port: 18880, enabled: true }),
    removeLocalConfig: () => undefined,
    ...overrides,
  }
}

function TerminalProbe() {
  const { lines } = useTerminalLog()
  return <div data-testid="log-count">{lines.length}</div>
}

// ResourceList only renders its sections when navView is 'browse'; force it
// since these tests exercise ResourceList in isolation, outside of App/MainArea.
function ForceBrowseNav({ children }: { children: React.ReactNode }) {
  const { navView, setNavView } = useAppState()
  useEffect(() => {
    if (navView !== 'browse') setNavView('browse')
  }, [navView, setNavView])
  return <>{children}</>
}

async function renderList(handlers?: Record<string, (...args: unknown[]) => unknown>) {
  mockRpc(defaultHandlers(handlers))
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <ForceBrowseNav>
          <ResourceList />
          <TerminalProbe />
        </ForceBrowseNav>
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

test('clicking + on a provider row calls duplicateProvider and logs the new slug', async () => {
  const duplicateProvider = mock(() => ({ newSlug: 'yls-copy' }))
  await renderList({
    duplicateProvider,
    info: (slug: unknown) => (slug === 'yls-copy' ? infoBySlug['yls'] : infoBySlug[slug as string]),
  })
  await waitFor(() => screen.getByText('yls'))
  fireEvent.click(screen.getByLabelText('新增子配置 yls'))
  await waitFor(() => expect(duplicateProvider).toHaveBeenCalledWith('yls'))
  expect(screen.getByTestId('log-count').textContent).not.toBe('0')
})

test('新增子配置 button is not shown for non-provider installed items', async () => {
  await renderList()
  await waitFor(() => screen.getByText('filesystem'))
  expect(screen.queryByLabelText('新增子配置 filesystem')).not.toBeInTheDocument()
})

test('the installed list shows an update badge and a real 更新 button for a package with an available update', async () => {
  const checkUpdates = mock(() => [
    { slug: 'filesystem', currentVersion: '0.8.0', latestVersion: '0.8.1' },
  ])
  const update = mock(() => [])
  await renderList({ checkUpdates, update })
  await waitFor(() => screen.getByText('filesystem'))
  expect(await screen.findByText('有更新')).toBeInTheDocument()
  const updateButton = screen.getByRole('button', { name: '更新' })
  fireEvent.click(updateButton)
  await waitFor(() => expect(update).toHaveBeenCalledWith('filesystem'))
})

function SetCategoryFilter({ category }: { category: 'provider' | 'skill' }) {
  const { setCategoryFilter } = useAppState()
  useEffect(() => { setCategoryFilter(category) }, [category, setCategoryFilter])
  return null
}

async function renderListWithCategory(category: 'provider' | 'skill', handlers?: Record<string, (...args: unknown[]) => unknown>) {
  mockRpc(defaultHandlers(handlers))
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <ForceBrowseNav>
          <SetCategoryFilter category={category} />
          <ResourceList />
          <TerminalProbe />
        </ForceBrowseNav>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

test('shows an inline local entry with 内置 badge and expandable port rows under the provider category', async () => {
  await renderListWithCategory('provider', {
    listLocalConfigs: () => [{ id: 'default', name: '默认', port: 18780, enabled: true }],
  })
  expect(await screen.findByText('local')).toBeInTheDocument()
  expect(await screen.findByText('内置')).toBeInTheDocument()
  expect(await screen.findByText('默认')).toBeInTheDocument()
})

test('clicking the local row sets selectedSlug to the sentinel', async () => {
  await renderListWithCategory('provider', {
    listLocalConfigs: () => [{ id: 'default', name: '默认', port: 18780, enabled: true }],
  })
  const localRow = (await screen.findByText('local')).closest('div')!.parentElement!
  fireEvent.click(localRow)
  await waitFor(() => expect(localRow.className).toContain('border-store-accent'))
})

test('does not show the local entry outside the provider category', async () => {
  await renderListWithCategory('skill', {
    listLocalConfigs: () => [{ id: 'default', name: '默认', port: 18780, enabled: true }],
  })
  await screen.findByPlaceholderText('搜索，或用 @ 过滤…')
  expect(screen.queryByText('内置')).not.toBeInTheDocument()
  expect(screen.queryByText('local')).not.toBeInTheDocument()
})

test('selecting the @updates token filters the installed list to only updatable packages', async () => {
  const checkUpdates = mock(() => [
    { slug: 'yls', currentVersion: '1.0.0', latestVersion: '1.1.0' },
  ])
  await renderList({ checkUpdates })
  await waitFor(() => screen.getByText('filesystem'))
  await waitFor(() => screen.getByText('有更新'))
  fireEvent.change(screen.getByPlaceholderText('搜索，或用 @ 过滤…'), { target: { value: '@' } })
  fireEvent.click(screen.getByText('@updates · 有更新'))
  expect(screen.queryByText('filesystem')).not.toBeInTheDocument()
  expect(screen.getByText('yls')).toBeInTheDocument()
})

test('shows a + button on a root provider row and renders duplicated children indented beneath it', async () => {
  await renderListWithCategory('provider', {
    list: () => providerTreeList,
    info: (slug: unknown) => providerTreeInfoBySlug[slug as string],
  })
  await screen.findByText('test-provider')
  expect(screen.getByLabelText('新增子配置 test-provider')).toBeInTheDocument()
  expect(await screen.findByText('test-provider-copy')).toBeInTheDocument()
})

test('clicking + on a provider row calls duplicateProvider and opens the new child for editing', async () => {
  let duplicatedSlug: string | undefined
  await renderListWithCategory('provider', {
    list: () => providerTreeList,
    info: (slug: unknown) => providerTreeInfoBySlug[slug as string],
    duplicateProvider: (...args: unknown[]) => {
      duplicatedSlug = args[0] as string
      return { newSlug: 'test-provider-copy' }
    },
  })
  fireEvent.click(await screen.findByLabelText('新增子配置 test-provider'))
  await waitFor(() => expect(duplicatedSlug).toBe('test-provider'))
  expect(await screen.findByText('编辑 test-provider-copy')).toBeInTheDocument()
})

test('removing a child row calls uninstall with the child slug, not the parent', async () => {
  let uninstalledSlug: string | undefined
  await renderListWithCategory('provider', {
    list: () => providerTreeList,
    info: (slug: unknown) => providerTreeInfoBySlug[slug as string],
    uninstall: (...args: unknown[]) => { uninstalledSlug = args[0] as string },
  })
  await screen.findByText('test-provider-copy')
  fireEvent.click(screen.getByLabelText('删除 test-provider-copy'))
  await waitFor(() => expect(uninstalledSlug).toBe('test-provider-copy'))
})

test('recommended section shows an already-installed provider with a 配置 button', async () => {
  await renderListWithCategory('provider', {
    list: () => providerTreeList,
    info: (slug: unknown) => providerTreeInfoBySlug[slug as string],
    search: () => [providerCatalogItem],
  })
  const recommendedButtons = await screen.findAllByRole('button', { name: '配置' })
  expect(recommendedButtons.length).toBeGreaterThan(0)
})

test('clicking 配置 on an already-installed recommended provider duplicates it, not re-installs it', async () => {
  let calledMethod: string | undefined
  await renderListWithCategory('provider', {
    list: () => providerTreeList,
    info: (slug: unknown) =>
      slug === 'x' ? providerTreeInfoBySlug['test-provider'] : providerTreeInfoBySlug[slug as string],
    search: () => [providerCatalogItem],
    duplicateProvider: () => { calledMethod = 'duplicateProvider'; return { newSlug: 'x' } },
    install: () => { calledMethod = 'install'; return { version: '1.0.0' } },
  })
  fireEvent.click((await screen.findAllByRole('button', { name: '配置' }))[0]!)
  await waitFor(() => expect(calledMethod).toBe('duplicateProvider'))
})
