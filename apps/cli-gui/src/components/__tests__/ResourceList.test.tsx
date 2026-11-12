import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { useEffect } from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { TerminalLogProvider, useTerminalLog } from '../../state/TerminalLog'
import * as rpcModule from '../../lib/rpc'
import { ResourceList } from '../ResourceList'
import { DetailPanel } from '../DetailPanel'
import { EntitlementProvider } from '../../state/Entitlement'
import { settleRpc } from '../../test/settle'

afterEach(async () => { cleanup(); await settleRpc(); mock.restore() })

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
    ...installedList[0], name: 'filesystem', description: '读写本地文件系统',
    publisher, tags: ['fs'], downloads: 388000,
  },
  yls: {
    ...installedList[1], name: 'yls', description: 'YLS 中转端点',
    publisher, tags: [], downloads: 32000,
  },
}

const origin = (site: string, upstreamId: string) => ({
  site, upstreamId, url: null, upstreamVersion: null, upstreamUpdatedAt: null,
  syncedAt: '2026-11-12T00:00:00Z', unavailableAt: null, unavailableReason: null,
})

// Rows as GET /api/resources returns them, plus the local slug the engine adds.
const catalogItem = {
  id: 'mcp-registry:io.github.upstash/context7', kind: 'mcp', name: 'context7', description: '文档上下文',
  author: { name: 'upstash', url: null }, version: '1.0.0', homepageUrl: null, installs: 118000,
  verified: false, tags: [], transports: ['npm'], origin: origin('mcp-registry', 'io.github.upstash/context7'), slug: 'context7',
}

const providerCatalogItem = {
  id: 'builtin:test-provider', kind: 'provider', name: 'test-provider', description: '测试供应商',
  author: { name: 'Agent Store', url: null }, version: '1.0.0', homepageUrl: null, installs: null,
  verified: true, tags: [], transports: [], origin: origin('builtin', 'test-provider'), slug: 'test-provider',
}

/** Filters like the API: by name and by kind. */
function page(rows: Array<{ name: string; kind: string }>) {
  return (q: unknown, o: unknown) => {
    const query = String(q ?? '').toLowerCase()
    const kind = (o as { category?: string } | undefined)?.category
    return {
      resources: rows.filter((r) => (!kind || r.kind === kind) && r.name.toLowerCase().includes(query)),
      nextOffset: null,
      offline: false,
    }
  }
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
    ...providerTreeList[0], name: 'test-provider', description: '测试供应商',
    publisher, tags: [], downloads: 0,
  },
  'test-provider-copy': {
    ...providerTreeList[1], name: 'test-provider-copy', description: '测试供应商',
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
    search: page([catalogItem]),
    checkUpdates: () => [],
    ...overrides,
  }
}

function TerminalProbe() {
  const { lines } = useTerminalLog()
  return <div data-testid="log-count">{lines.length}</div>
}

function EditingProbe() {
  const { editingConfigSlug } = useAppState()
  return <div data-testid="editing-config-slug">{editingConfigSlug ?? ''}</div>
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
  expect(screen.getByText('已配置')).toBeInTheDocument()
  expect(screen.getByText('推荐')).toBeInTheDocument()
})

test('does not render a persistent Claude Code / Codex tab bar above the search box', async () => {
  await renderList()
  await waitFor(() => screen.getByText('filesystem'))
  expect(screen.queryByText('Claude Code')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Codex' })).not.toBeInTheDocument()
})

test('the search input uses accent-colored mono text', async () => {
  await renderList()
  const input = await screen.findByPlaceholderText('搜索，或用 @ 过滤…')
  expect(input.className).toContain('font-mono')
  expect(input.className).toContain('text-store-accent')
})

test('the filter funnel button opens the dropdown with 发现/状态/目标应用 sections', async () => {
  await renderList()
  await waitFor(() => screen.getByText('context7'))
  fireEvent.click(screen.getByLabelText('筛选过滤'))
  expect(screen.getByText('发现')).toBeInTheDocument()
  expect(screen.getByText('状态')).toBeInTheDocument()
  expect(screen.getByText('目标应用')).toBeInTheDocument()
  expect(screen.getByText('精选')).toBeInTheDocument()
  expect(screen.getByText('推荐', { selector: 'span' })).toBeInTheDocument()
  expect(screen.getByText('可更新')).toBeInTheDocument()
  expect(screen.queryByText('收藏')).not.toBeInTheDocument()
  expect(screen.getByText('Claude Code')).toBeInTheDocument()
  expect(screen.getByText('Codex')).toBeInTheDocument()
})

test('selecting 目标应用 · Codex in the filter dropdown switches the active agent app', async () => {
  const disable = mock(() => undefined)
  await renderList({ disable })
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.click(screen.getByLabelText('筛选过滤'))
  fireEvent.click(screen.getByText('Codex'))
  expect(screen.queryByText('发现')).not.toBeInTheDocument()
})

test('typing @ opens the filter token menu; selecting @installed hides the recommended group', async () => {
  await renderList()
  await waitFor(() => screen.getByText('context7'))
  fireEvent.change(screen.getByPlaceholderText('搜索，或用 @ 过滤…'), { target: { value: '@' } })
  fireEvent.click(screen.getByText('已安装'))
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

test('clicking 安装 on a recommended item installs it through the shared policy and refreshes', async () => {
  const install = mock(() => ({ slug: 'x', version: '1.0.0', installedAt: '', category: 'mcp', enabled: [], notEnabled: [] }))
  await renderList({ installAndEnable: install })
  await waitFor(() => screen.getByText('context7'))
  fireEvent.click(screen.getByText('安装'))
  await waitFor(() => expect(install).toHaveBeenCalledWith('mcp-registry:io.github.upstash/context7'))
  expect(screen.getByTestId('log-count').textContent).not.toBe('0')
})

test('a recommended row shows its source and install count; search, kind and sort go to the catalog', async () => {
  const calls: unknown[][] = []
  const search = (...args: unknown[]) => {
    calls.push(args)
    return page([catalogItem, { ...providerCatalogItem, name: 'openrouter' }])(args[0], args[1])
  }
  await renderList({ search })
  expect(await screen.findByText('MCP Registry · ↓ 118.0K')).toBeInTheDocument()
  expect(screen.getByText('内置 · ↓ —')).toBeInTheDocument()
  expect(screen.getByLabelText('已验证')).toBeInTheDocument()
  expect(calls[0]).toEqual(['', { sort: 'default', limit: 50 }])

  fireEvent.change(screen.getByPlaceholderText('搜索，或用 @ 过滤…'), { target: { value: '@' } })
  fireEvent.click(screen.getByText('最热门'))
  await waitFor(() => expect(calls.at(-1)).toEqual(['', { sort: 'installs', limit: 50 }]))
})

test('more catalog rows load on demand; an unreachable catalog says the rows are cached', async () => {
  const search = (_q: unknown, o: unknown) => {
    const offset = (o as { offset?: number }).offset ?? 0
    return offset === 0
      ? { resources: [catalogItem], nextOffset: 50, offline: true }
      : { resources: [{ ...catalogItem, id: 'mcp-registry:io.x/second', name: 'second', slug: 'second' }], nextOffset: null, offline: false }
  }
  await renderList({ search })
  expect(await screen.findByText('目录暂时取不到，显示的是上次缓存的结果')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
  expect(await screen.findByText('second')).toBeInTheDocument()
  expect(screen.getByText('context7')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '加载更多' })).toBeNull()
})

test('clicking the × uninstall icon on an installed item calls uninstall', async () => {
  const uninstall = mock(() => undefined)
  await renderList({ uninstall })
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.click(screen.getByLabelText('卸载 filesystem'))
  await waitFor(() => expect(uninstall).toHaveBeenCalledWith('filesystem'))
})

test('installed rows no longer render an 已启用/已禁用 toggle pill or an 编辑 button', async () => {
  await renderList()
  await waitFor(() => screen.getByText('filesystem'))
  expect(screen.queryByLabelText('为 claude 禁用 filesystem')).not.toBeInTheDocument()
  expect(screen.queryByText('编辑')).not.toBeInTheDocument()
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

test('the installed list shows an amber outdated dot next to the name for a package with an available update, with no update button', async () => {
  const checkUpdates = mock(() => [
    { slug: 'filesystem', currentVersion: '0.8.0', latestVersion: '0.8.1' },
  ])
  await renderList({ checkUpdates })
  const name = await screen.findByText('filesystem')
  await waitFor(() => expect(name.parentElement?.querySelector('.bg-store-amber')).not.toBeNull())
  expect(screen.queryByRole('button', { name: '更新' })).not.toBeInTheDocument()
  expect(screen.queryByText('有更新')).not.toBeInTheDocument()
})

function SetCategoryFilter({ category }: { category: 'provider' | 'skill' | 'mcp' }) {
  const { setCategoryFilter } = useAppState()
  useEffect(() => { setCategoryFilter(category) }, [category, setCategoryFilter])
  return null
}

async function renderListWithCategory(category: 'provider' | 'skill' | 'mcp', handlers?: Record<string, (...args: unknown[]) => unknown>) {
  mockRpc(defaultHandlers(handlers))
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <ForceBrowseNav>
          <SetCategoryFilter category={category} />
          <ResourceList />
          <TerminalProbe />
          <EditingProbe />
        </ForceBrowseNav>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

const localCatalogItem = { ...providerCatalogItem, id: 'builtin:local', slug: 'local', name: 'local', origin: origin('builtin', 'local') }

test('renders local as an ordinary provider row (no 内置 badge, no pinned port rows)', async () => {
  await renderListWithCategory('provider', {
    search: page([localCatalogItem]),
  })
  expect(await screen.findByText('local')).toBeInTheDocument()
  expect(screen.queryByText('内置')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('新增本地监听配置')).not.toBeInTheDocument()
})

test('clicking the local provider row selects it as a normal provider', async () => {
  await renderListWithCategory('provider', {
    search: page([localCatalogItem]),
  })
  const localRow = (await screen.findByText('local')).closest('[class*="border-store"]')! as HTMLElement
  fireEvent.click(localRow)
  await waitFor(() => expect(localRow.className).toContain('border-store-accent'))
})

test('does not show the local provider row outside the provider category', async () => {
  await renderListWithCategory('skill', {
    search: page([localCatalogItem]),
  })
  await screen.findByPlaceholderText('搜索，或用 @ 过滤…')
  expect(screen.queryByText('local')).not.toBeInTheDocument()
})

test('selecting the @updates token filters the installed list to only updatable packages', async () => {
  const checkUpdates = mock(() => [
    { slug: 'yls', currentVersion: '1.0.0', latestVersion: '1.1.0' },
  ])
  await renderList({ checkUpdates })
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.change(screen.getByPlaceholderText('搜索，或用 @ 过滤…'), { target: { value: '@' } })
  fireEvent.click(screen.getByText('可更新'))
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
  await waitFor(() => expect(screen.getByTestId('editing-config-slug').textContent).toBe('test-provider-copy'))
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
    search: page([providerCatalogItem]),
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
    search: page([providerCatalogItem]),
    duplicateProvider: () => { calledMethod = 'duplicateProvider'; return { newSlug: 'x' } },
    installAndEnable: () => { calledMethod = 'install'; return { version: '1.0.0', enabled: [], notEnabled: [] } },
  })
  fireEvent.click((await screen.findAllByRole('button', { name: '配置' }))[0]!)
  await waitFor(() => expect(calledMethod).toBe('duplicateProvider'))
})

// L2: uninstall could not pass --force from the desktop client.
test('an uninstall refused for an entry changed outside Agent Store offers a forced uninstall', async () => {
  const calls: unknown[][] = []
  const uninstall = mock((...args: unknown[]) => {
    calls.push(args)
    if (args.length === 1) throw new rpcModule.RpcError('The Claude Code MCP entry "filesystem" was changed outside Agent Store; Use --force', 'McpChangedOutsideError', { tool: 'claude' })
  })
  await renderList({ uninstall })
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.click(screen.getByLabelText('卸载 filesystem'))
  const dialog = await screen.findByRole('dialog')
  expect(dialog.textContent).toContain('卸载失败')
  const main = dialog.textContent!.split('详细信息')[0]
  expect(main).toContain('Claude Code 里的这条配置在 Agent Store 之外被改动过')
  expect(main).not.toContain('--force')
  expect(dialog.querySelector('details pre')?.textContent).toContain('Use --force')
  fireEvent.click(screen.getByRole('button', { name: '强制卸载' }))
  await waitFor(() => expect(calls).toEqual([['filesystem'], ['filesystem', { force: true }]]))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

test('an uninstall error that --force does not help is shown without the force button', async () => {
  const uninstall = mock(() => { throw new rpcModule.RpcError('Cannot read targets.json', 'Error') })
  await renderList({ uninstall })
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.click(screen.getByLabelText('卸载 filesystem'))
  const dialog = await screen.findByRole('dialog')
  expect(dialog.textContent).toContain('Cannot read targets.json')
  expect(screen.queryByRole('button', { name: '强制卸载' })).toBeNull()
})

test('installing an MCP that needs config opens its config page', async () => {
  const installAndEnable = mock(() => ({
    slug: 'context7', version: '1.0.0', installedAt: '', category: 'mcp', enabled: [],
    notEnabled: [{ target: 'claude', reason: 'needs-config', message: 'missing key' }],
  }))
  await renderListWithCategory('mcp', { installAndEnable })
  await waitFor(() => screen.getByText('context7'))
  fireEvent.click(screen.getByText('安装'))
  await waitFor(() => expect(installAndEnable).toHaveBeenCalledWith('mcp-registry:io.github.upstash/context7'))
  await waitFor(() => expect(screen.getByTestId('editing-config-slug').textContent).toBe('context7'))
})

// #97: the detail pane must follow the list. Selecting another item while a
// config page is open shows that item; switching only the category keeps the open page,
// as the mockup's setCliFilter does (it leaves cliEditId alone).
test('selecting another item while a provider config page is open switches the detail pane to it', async () => {
  const childInfo = { ...(infoBySlug.yls as object), slug: 'yls-copy', name: 'yls-copy', parentSlug: 'yls', currentConfig: { name: 'copy' } }
  mockRpc(defaultHandlers({
    info: (slug: unknown) => (slug === 'yls-copy' ? childInfo : infoBySlug[slug as string]),
    duplicateProvider: () => ({ newSlug: 'yls-copy' }),
    getReviews: () => [], getVersions: () => [],
    getEntitlements: () => ({ plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }),
  }))
  render(
    <AppStateProvider>
      <EntitlementProvider>
        <TerminalLogProvider>
          <ForceBrowseNav>
            <ResourceList />
            <DetailPanel />
          </ForceBrowseNav>
        </TerminalLogProvider>
      </EntitlementProvider>
    </AppStateProvider>
  )
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.click(screen.getByLabelText('新增子配置 yls'))
  expect(await screen.findByDisplayValue('copy')).toBeInTheDocument()
  fireEvent.click(screen.getByText('filesystem'))
  expect(await screen.findByRole('heading', { name: 'filesystem' })).toBeInTheDocument()
  expect(screen.queryByDisplayValue('copy')).toBeNull()
})
