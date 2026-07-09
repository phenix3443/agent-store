import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { TerminalLogProvider } from '../../state/TerminalLog'
import * as rpcModule from '../../lib/rpc'
import { DetailPanel } from '../DetailPanel'

afterEach(() => { cleanup(); mock.restore() })

const publisher = { id: 'p', slug: 'anthropic', name: 'anthropic', avatarUrl: '', tier: 'official' as const }

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) =>
    handlers[method]?.(...args)) as typeof rpcModule.callRpc)
}

function Select({ slug }: { slug: string }) {
  const { setSelectedSlug } = useAppState()
  return <button onClick={() => setSelectedSlug(slug)}>select</button>
}

function renderPanel(slug = 'filesystem') {
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <Select slug={slug} />
        <DetailPanel />
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

test('renders local as a normal provider detail from the info RPC', async () => {
  mockRpc({
    info: () => ({
      slug: 'local', category: 'provider', version: '1.0.0', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude', 'codex'], enabledFor: {},
      name: 'local', description: '内置本地代理',
      publisher, tags: ['relay', 'built-in'], downloads: 156000,
    }),
    list: () => [],
  })
  renderPanel('local')
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'local' })).toBeInTheDocument())
  expect(screen.queryByText('内置 Provider')).not.toBeInTheDocument()
})

test('shows the empty state with no selection', () => {
  renderPanel()
  expect(screen.getByText('从左侧选择一个资源查看详情')).toBeInTheDocument()
})

test('shows an installed item detail from the info RPC', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: { claude: true },
      name: 'filesystem', description: '读写本地文件系统',
      publisher, tags: ['fs'], downloads: 388000,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'filesystem' })).toBeInTheDocument())
  expect(screen.getByText('✓ 已安装')).toBeInTheDocument()
})

test('shows an install button for a not-yet-installed item and installs it', async () => {
  const install = mock(() => ({ version: '1.0.0' }))
  mockRpc({
    info: () => { throw new Error('Item not installed: filesystem') },
    search: () => [{
      id: 'i1', slug: 'filesystem', name: 'filesystem', description: '读写本地文件系统',
 category: 'mcp', version: '0.8.1', publisher,
      compatibleWith: ['claude'], tags: [], downloads: 10, rating: 4.5, status: 'published',
      installHook: { steps: [] }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      configSchema: {},
    }],
    install,
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByRole('button', { name: '安装' }))
  fireEvent.click(screen.getByRole('button', { name: '安装' }))
  await waitFor(() => expect(install).toHaveBeenCalledWith('filesystem'))
})

test('switching to the 审查 tab shows the automated review verdict', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', publisher, tags: [], downloads: 0,
      review: { tier: 'verified', quality: 4, risk: 'medium', summary: '实用的文件系统 MCP', concerns: ['执行 npx 远程包'] },
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByRole('heading', { name: 'filesystem' }))
  fireEvent.click(screen.getByText('审查'))
  expect(screen.getByText('4/5')).toBeInTheDocument()
  expect(screen.getByText('中等风险')).toBeInTheDocument()
  expect(screen.getByText('实用的文件系统 MCP')).toBeInTheDocument()
  expect(screen.getByText('执行 npx 远程包')).toBeInTheDocument()
})

test('switching to the 版本 tab shows the current version and an honest no-history note', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', publisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByRole('heading', { name: 'filesystem' }))
  fireEvent.click(screen.getByRole('button', { name: '版本' }))
  expect(screen.getAllByText('v0.8.1').length).toBeGreaterThan(0)
  expect(screen.getByText('latest')).toBeInTheDocument()
  expect(screen.getByText('当前版本')).toBeInTheDocument()
  expect(screen.getByText('更早的版本历史暂未提供')).toBeInTheDocument()
})

test('概览 tab renders overview, install command, install steps, use case, and footer facts', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: '读写本地文件系统', publisher, tags: [], downloads: 0,
      transport: 'stdio', serverCommand: './server',
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByRole('heading', { name: 'filesystem' }))
  expect(screen.getByText('概述')).toBeInTheDocument()
  expect(screen.getAllByText('agent-store add filesystem').length).toBeGreaterThan(1)
  expect(screen.getByText('安装步骤')).toBeInTheDocument()
  expect(screen.getByText('适用场景')).toBeInTheDocument()
  expect(screen.getByText(/传输方式：stdio/)).toBeInTheDocument()
  expect(screen.getByText(/启动命令：\.\/server/)).toBeInTheDocument()
  expect(screen.getByText(/类型：MCP/)).toBeInTheDocument()
  expect(screen.getByText(/维护者：anthropic/)).toBeInTheDocument()
  expect(screen.getByText('当前版本：v0.8.1')).toBeInTheDocument()
})

test('clicking the heart button toggles favorite state', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', publisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByLabelText('收藏'))
  fireEvent.click(screen.getByLabelText('收藏'))
  expect(screen.getByLabelText('取消收藏')).toBeInTheDocument()
})

test('shows 官方 and 已发布 badges together for an installed official-tier item (status is always visible)', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', publisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByRole('heading', { name: 'filesystem' }))
  expect(screen.getByText('官方')).toBeInTheDocument()
  expect(screen.getByText('已发布')).toBeInTheDocument()
})

test('shows a 已验证 tier badge for a verified-tier publisher', async () => {
  const verifiedPublisher = { ...publisher, tier: 'verified' as const }
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', publisher: verifiedPublisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByRole('heading', { name: 'filesystem' }))
  expect(screen.getByText('已验证')).toBeInTheDocument()
})

test('does not show a tier badge for a community-tier publisher, but still shows the status badge', async () => {
  const communityPublisher = { ...publisher, tier: 'community' as const }
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', publisher: communityPublisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByRole('heading', { name: 'filesystem' }))
  expect(screen.queryByText('官方')).not.toBeInTheDocument()
  expect(screen.queryByText('已验证')).not.toBeInTheDocument()
  expect(screen.getByText('已发布')).toBeInTheDocument()
})

test('shows a 已发布 badge for a not-yet-installed published catalog item', async () => {
  mockRpc({
    info: () => { throw new Error('Item not installed: filesystem') },
    search: () => [{
      id: 'i1', slug: 'filesystem', name: 'filesystem', description: '读写本地文件系统',
 category: 'mcp', version: '0.8.1', publisher,
      compatibleWith: ['claude'], tags: [], downloads: 10, rating: 4.5, status: 'published',
      installHook: { steps: [] }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      configSchema: {},
    }],
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByRole('heading', { name: 'filesystem' }))
  expect(screen.getByText('已发布')).toBeInTheDocument()
})

test('shows the automated quality score in the meta line when a review exists', async () => {
  mockRpc({
    info: () => { throw new Error('Item not installed: filesystem') },
    search: () => [{
      id: 'i1', slug: 'filesystem', name: 'filesystem', description: '读写本地文件系统',
      category: 'mcp', version: '0.8.1', publisher,
      compatibleWith: ['claude'], tags: [], downloads: 10, rating: 0, status: 'published',
      installHook: { steps: [] }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      configSchema: {},
      review: { tier: 'verified', quality: 4, risk: 'low', summary: 's', concerns: [] },
    }],
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByRole('heading', { name: 'filesystem' }))
  expect(screen.getByText('质量 4/5')).toBeInTheDocument()
})

test('clicking the copy button copies the install command to the clipboard', async () => {
  const writeText = mock(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', publisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByLabelText('复制安装命令'))
  fireEvent.click(screen.getByLabelText('复制安装命令'))
  expect(writeText).toHaveBeenCalledWith('agent-store add filesystem')
})

test('shows a child-config count banner for a provider with duplicated configs', async () => {
  mockRpc({
    info: () => ({
      slug: 'test-provider', category: 'provider', version: '1.0.0', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: { claude: true },
      name: 'test-provider', description: 'test provider',
      publisher, tags: [], downloads: 100, installed: true,
    }),
    list: () => [
      { slug: 'test-provider', category: 'provider', version: '1.0.0', installedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: { claude: true },
        name: 'test-provider', description: 'test provider',
        publisher, tags: [], downloads: 100, installed: true },
      { slug: 'test-provider-copy', category: 'provider', version: '1.0.0', installedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: { claude: true },
        name: 'test-provider-copy', description: 'test provider copy',
        publisher, tags: [], downloads: 50, installed: true, parentSlug: 'test-provider' },
    ],
  })
  renderPanel('test-provider')
  fireEvent.click(screen.getByText('select'))
  expect(await screen.findByText(/已有 1 份配置/)).toBeInTheDocument()
})

test('does not show the child-config banner for a provider with no duplicates', async () => {
  mockRpc({
    info: () => ({
      slug: 'test-provider', category: 'provider', version: '1.0.0', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: { claude: true },
      name: 'test-provider', description: 'test provider',
      publisher, tags: [], downloads: 100, installed: true,
    }),
    list: () => [
      { slug: 'test-provider', category: 'provider', version: '1.0.0', installedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: { claude: true },
        name: 'test-provider', description: 'test provider',
        publisher, tags: [], downloads: 100, installed: true },
    ],
  })
  renderPanel('test-provider')
  fireEvent.click(screen.getByText('select'))
  await screen.findByRole('heading', { name: 'test-provider' })
  expect(screen.queryByText(/已有.*份配置/)).not.toBeInTheDocument()
})
