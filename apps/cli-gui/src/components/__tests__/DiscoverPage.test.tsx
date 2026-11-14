import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { DiscoverPage } from '../discover/DiscoverPage'
import * as rpcModule from '../../lib/rpc'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { TerminalLogProvider } from '../../state/TerminalLog'
import { TooltipProvider } from '../ui/tooltip'
import { settleRpc } from '../../test/settle'

afterEach(async () => { cleanup(); await settleRpc(); mock.restore() })

const origin = (site: string) => ({ site, upstreamId: 'x', url: null, upstreamVersion: null, upstreamUpdatedAt: '2026-10-01T00:00:00Z', syncedAt: '', unavailableAt: null, unavailableReason: null })
const row = (id: string, kind: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, kind, name, description: `${name} desc`, author: { name: 'someone', url: null }, version: '1.0.0', homepageUrl: null,
  installs: null, stars: 12, verified: false, tags: [], transports: [], origin: origin(id.split(':')[0]), slug: name.toLowerCase(), ...extra,
})
const ctx = row('mcp-registry:io.github.upstash/context7', 'mcp', 'Context7', { verified: true, stars: 4200 })
const sk = row('github:vercel-labs/skills/find-skills', 'skill', 'find-skills', { installs: 1500, stars: null })
const local = row('builtin:local', 'provider', 'Local', {})

type H = Record<string, (...args: unknown[]) => unknown>
function mockRpc(overrides: H = {}) {
  const calls: { method: string; args: unknown[] }[] = []
  const handlers: H = {
    search: () => ({ resources: [sk, ctx, local], nextOffset: 50, offline: false }),
    list: () => [{ slug: 'skills-find-skills', category: 'skill', resourceId: sk.id, enabledFor: {}, compatibleWith: ['claude'] }],
    checkUpdates: () => [],
    getResource: (id) => ({
      ...ctx, id, install: { id, resourceId: id, slug: 'context7', name: 'Context7', description: '', category: 'mcp', version: '1.0.0', publisher: { name: 'upstash', tier: 'community' }, compatibleWith: ['claude', 'codex'], tags: [], downloads: 0, installHook: { steps: [] }, transport: 'stdio', serverCommand: 'npx -y @upstash/context7-mcp', configSchema: {} },
    }),
    ...overrides,
  }
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push({ method, args })
    return handlers[method]?.(...args)
  }) as typeof rpcModule.callRpc)
  return calls
}

function Probe() {
  const { installRef, selectedSlug, categoryFilter } = useAppState()
  return <span data-testid="probe">{`${installRef ?? ''}|${selectedSlug ?? ''}|${categoryFilter}`}</span>
}

function renderPage() {
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <TooltipProvider>
          <DiscoverPage />
          <Probe />
        </TooltipProvider>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

test('lists the catalog with local pinned first and installed rows marked', async () => {
  mockRpc()
  renderPage()
  const list = await screen.findByText('Context7')
  expect(list).toBeInTheDocument()
  const names = screen.getAllByRole('button').map((b) => b.textContent ?? '')
  expect(names.findIndex((n) => n.includes('Local'))).toBeLessThan(names.findIndex((n) => n.includes('find-skills')))
  expect(screen.getByText('已安装')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '管理' })).toBeInTheDocument()
  expect(screen.getByText('↓ 1.5K')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '加载更多' })).toBeInTheDocument()
})

test('search, kind and sort go to the server; 精选 keeps the verified rows', async () => {
  const calls = mockRpc()
  renderPage()
  await screen.findByText('Context7')
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索名称、作者或说明' }), { target: { value: 'ctx' } })
  await waitFor(() => expect(calls.some((c) => c.method === 'search' && c.args[0] === 'ctx')).toBe(true))
  fireEvent.click(screen.getByRole('button', { name: 'MCP' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'search' && (c.args[1] as { category?: string }).category === 'mcp')).toBe(true))
  fireEvent.change(screen.getByRole('combobox', { name: '排序' }), { target: { value: 'installs' } })
  await waitFor(() => expect(calls.some((c) => c.method === 'search' && (c.args[1] as { sort?: string }).sort === 'installs')).toBe(true))
  fireEvent.change(screen.getByRole('combobox', { name: '排序' }), { target: { value: 'featured' } })
  await waitFor(() => expect(screen.queryByText('find-skills')).toBeNull())
  expect(screen.getByText('Context7')).toBeInTheDocument()
})

test('安装 hands the id to the install dialog', async () => {
  mockRpc()
  renderPage()
  await screen.findByText('Context7')
  const installs = screen.getAllByRole('button', { name: '安装' })
  fireEvent.click(installs[installs.length - 1])
  await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('mcp-registry:io.github.upstash/context7|'))
})

test('管理 opens the installed entry in its library', async () => {
  mockRpc()
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: '管理' }))
  await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('|skills-find-skills|skill'))
})

test('a row opens the pane with details, what installing writes and the CLI command', async () => {
  mockRpc()
  renderPage()
  fireEvent.click(await screen.findByText('Context7'))
  const pane = await screen.findByRole('complementary', { name: 'mcp-registry:io.github.upstash/context7' })
  await waitFor(() => expect(pane).toHaveTextContent('本机进程，用 npx 启动'))
  expect(pane).toHaveTextContent('Claude Code、Codex')
  expect(pane).toHaveTextContent('aas install mcp-registry:io.github.upstash/context7')
  expect(pane).toHaveTextContent('启动命令：npx -y @upstash/context7-mcp')
  fireEvent.click(within(pane).getByRole('button', { name: '收藏' }))
  expect(within(pane).getByRole('button', { name: '取消收藏' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull())
})

test('offline shows the cached rows with a notice', async () => {
  mockRpc({ search: () => ({ resources: [ctx], nextOffset: 50, offline: true }) })
  renderPage()
  expect(await screen.findByText('目录暂时取不到')).toBeInTheDocument()
  expect(screen.getByText('Context7')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '加载更多' })).toBeNull()
})

test('a failing search shows the error with a retry', async () => {
  let fail = true
  mockRpc({ search: () => { if (fail) throw new Error('500'); return { resources: [ctx], nextOffset: null, offline: false } } })
  renderPage()
  expect(await screen.findByText('目录返回了错误')).toBeInTheDocument()
  fail = false
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByText('Context7')).toBeInTheDocument()
})

test('no results offers to clear the filters', async () => {
  mockRpc({ search: () => ({ resources: [], nextOffset: null, offline: false }) })
  renderPage()
  expect(await screen.findByText('没有匹配的结果')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '清除筛选' })).toBeInTheDocument()
})
