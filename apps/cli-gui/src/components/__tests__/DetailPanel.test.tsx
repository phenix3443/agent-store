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
  const install = mock(() => ({ slug: 'x', version: '1.0.0', installedAt: '', category: 'mcp', enabled: [], notEnabled: [] }))
  mockRpc({
    info: () => { throw new Error('Item not installed: filesystem') },
    search: () => [{
      id: 'i1', slug: 'filesystem', name: 'filesystem', description: '读写本地文件系统',
 category: 'mcp', version: '0.8.1', publisher,
      compatibleWith: ['claude'], tags: [], downloads: 10, rating: 4.5, status: 'published',
      installHook: { steps: [] }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      configSchema: {},
    }],
    installAndEnable: install,
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByRole('button', { name: '安装' }))
  fireEvent.click(screen.getByRole('button', { name: '安装' }))
  await waitFor(() => expect(install).toHaveBeenCalledWith('filesystem'))
})

test('the 评价 tab lists user reviews', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', publisher, tags: [], downloads: 0,
    }),
    getReviews: () => [
      { rating: 4, body: '好用', authorName: 'alice', updatedAt: '2026-06-01T00:00:00Z' },
      { rating: 5, authorName: null, updatedAt: '2026-06-02T00:00:00Z' },
    ],
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByRole('heading', { name: 'filesystem' }))
  fireEvent.click(screen.getByRole('button', { name: '评价' }))
  await waitFor(() => screen.getByText('alice'))
  expect(screen.getByText('好用')).toBeInTheDocument()
  expect(screen.getByText('★★★★')).toBeInTheDocument()
  expect(screen.getByText('匿名')).toBeInTheDocument()
  expect(screen.getByText('在网页版商店可发表评价')).toBeInTheDocument()
})

test('switching to the 版本 tab shows the real version history', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', publisher, tags: [], downloads: 0,
    }),
    getVersions: () => [
      { version: '0.8.1', publishedAt: '2026-07-01T00:00:00Z' },
      { version: '0.8.0', publishedAt: '2026-06-01T00:00:00Z' },
    ],
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByRole('heading', { name: 'filesystem' }))
  fireEvent.click(screen.getByRole('button', { name: '版本' }))
  await waitFor(() => screen.getByText('v0.8.0'))
  expect(screen.getAllByText('v0.8.1').length).toBeGreaterThan(0)
  expect(screen.getByText('latest')).toBeInTheDocument()
  expect(screen.getByText('当前版本')).toBeInTheDocument()
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
  expect(screen.getAllByText('aas install filesystem').length).toBeGreaterThan(1)
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

test('shows the 官方 tier badge and no publication status badge for an installed official-tier item', async () => {
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
  expect(screen.queryByText('已发布')).not.toBeInTheDocument()
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

test('does not show a tier badge for a community-tier publisher', async () => {
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
  expect(writeText).toHaveBeenCalledWith('aas install filesystem')
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
  expect(await screen.findByText(/1 份配置/)).toBeInTheDocument()
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
  expect(screen.queryByText(/份配置/)).not.toBeInTheDocument()
})

const mcpInfo = {
  slug: 'github', category: 'mcp', version: '0.6.2', installedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude', 'codex'], enabledFor: {},
  name: 'github', description: 'GitHub API', publisher, tags: [], downloads: 0,
  configSchema: { type: 'object', properties: { token: { type: 'string', description: 'GitHub token' } }, required: ['token'] },
}
const mcpStatus = [
  { target: 'claude', compatible: true, enabled: false, blocker: { reason: 'needs-config', message: 'x' } },
  { target: 'codex', compatible: true, enabled: false, blocker: { reason: 'needs-config', message: 'x' } },
]

// H7: an installed MCP can be configured and enabled from the desktop client.
test('an installed MCP has a 配置 button that opens the MCP config page', async () => {
  mockRpc({ info: () => mcpInfo, getTargetStatus: () => mcpStatus, getReviews: () => [], getVersions: () => [] })
  renderPanel('github')
  fireEvent.click(screen.getByText('select'))
  fireEvent.click(await screen.findByRole('button', { name: '配置' }))
  expect(await screen.findByLabelText(/GitHub token/)).toBeInTheDocument()
  expect(screen.getByLabelText('Claude Code')).toBeInTheDocument()
})

test('installing an MCP that needs config goes straight to its config page', async () => {
  let installed = false
  mockRpc({
    info: () => { if (!installed) throw new Error('Item not installed: github'); return mcpInfo },
    search: () => [{ ...mcpInfo, id: 'i', rating: 0, status: 'published', installHook: { steps: [] }, createdAt: '', transport: 'stdio' }],
    installAndEnable: () => {
      installed = true
      return { slug: 'github', version: '0.6.2', installedAt: '', category: 'mcp', enabled: [], notEnabled: mcpStatus.map(s => ({ target: s.target, reason: 'needs-config', message: 'x' })) }
    },
    getTargetStatus: () => mcpStatus,
  })
  renderPanel('github')
  fireEvent.click(screen.getByText('select'))
  fireEvent.click(await screen.findByRole('button', { name: '安装' }))
  expect(await screen.findByLabelText(/GitHub token/)).toBeInTheDocument()
})

test('a failed install is shown on the detail page', async () => {
  mockRpc({
    info: () => { throw new Error('Item not installed: github') },
    search: () => [{ ...mcpInfo, id: 'i', rating: 0, status: 'published', installHook: { steps: [] }, createdAt: '', transport: 'stdio' }],
    installAndEnable: () => { throw new Error('Installed github 0.6.2, but enabling it for claude failed: conflict') },
  })
  renderPanel('github')
  fireEvent.click(screen.getByText('select'))
  fireEvent.click(await screen.findByRole('button', { name: '安装' }))
  expect((await screen.findByRole('alert')).textContent).toContain('enabling it for claude failed')
})
