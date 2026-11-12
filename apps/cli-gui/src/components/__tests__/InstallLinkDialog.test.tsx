import { test, expect, afterEach, beforeEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { TerminalLogProvider, useTerminalLog } from '../../state/TerminalLog'
import * as rpcModule from '../../lib/rpc'
import { settleRpc } from '../../test/settle'

const handlers = new Set<(url: string) => void>()
let launchLinks: string[] = []
mock.module('../../lib/deepLink', () => ({
  onDeepLink: async (h: (url: string) => void) => {
    handlers.add(h)
    return () => handlers.delete(h)
  },
  getLaunchDeepLinks: async () => launchLinks,
}))
const focusMock = mock(async () => {})
mock.module('../../lib/focusWindow', () => ({ focusMainWindow: focusMock }))

const { InstallLinkDialog, resetLaunchLinksForTest } = await import('../InstallLinkDialog')

const publisher = { id: 'p', slug: 'anthropic', name: 'anthropic', avatarUrl: '', tier: 'official' as const }
const base = {
  id: 'i', version: '0.8.1', publisher, compatibleWith: ['claude'], tags: [], downloads: 10, rating: 0,
  status: 'published', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}
const mcpItem = {
  ...base, slug: 'filesystem', name: 'Filesystem', description: '读写本地文件', category: 'mcp',
  transport: 'stdio', serverCommand: 'npx -y @mcp/filesystem', configSchema: {},
  installHook: { steps: [{ type: 'script', command: 'npm install -g @mcp/filesystem' }] },
}
const skillItem = {
  ...base, slug: 'pdf-tools', name: 'PDF Tools', description: '处理 PDF', category: 'skill',
  contentUrl: 'https://example.test/pdf-tools.md', installHook: { steps: [] },
  publisher: { ...publisher, name: 'someone', tier: 'community' as const },
}
const providerItem = {
  ...base, slug: 'openrouter', name: 'OpenRouter', description: '聚合', category: 'provider',
  configSchema: {}, supportedModels: ['m1'], installHook: { steps: [] },
  publisher: { ...publisher, name: 'openrouter', tier: 'verified' as const },
}

let calls: Array<{ method: string; args: unknown[] }> = []

function mockRpc(overrides: Record<string, (...args: unknown[]) => unknown> = {}) {
  const defaults: Record<string, (...args: unknown[]) => unknown> = {
    info: (slug) => { throw new Error(`Item not installed: ${String(slug)}`) },
    search: () => [mcpItem, skillItem, providerItem],
    installAndEnable: () => ({ version: '0.8.1', enabled: [], notEnabled: [] }),
  }
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push({ method, args })
    const handler = overrides[method] ?? defaults[method]
    if (!handler) throw new Error(`unexpected RPC: ${method}`)
    return handler(...args)
  }) as typeof rpcModule.callRpc)
}

function Probe() {
  const { selectedSlug, navView, categoryFilter, editingConfigSlug } = useAppState()
  const { lines } = useTerminalLog()
  return (
    <div>
      <span data-testid="selected">{selectedSlug ?? ''}</span>
      <span data-testid="nav">{navView}</span>
      <span data-testid="category">{categoryFilter}</span>
      <span data-testid="editing">{editingConfigSlug ?? ''}</span>
      <span data-testid="log">{lines.map((l) => l.text).join('|')}</span>
    </div>
  )
}

async function renderDialog() {
  render(
    <AppStateProvider>
      <TerminalLogProvider>
        <Probe />
        <InstallLinkDialog />
      </TerminalLogProvider>
    </AppStateProvider>
  )
  await waitFor(() => expect(handlers.size).toBe(1))
}

// Async act so the RPC continuations settle inside it; left to the scheduler
// outside act, happy-dom only flushes them after a multi-second delay.
async function openLink(url: string) {
  await act(async () => {
    for (const h of handlers) h(url)
  })
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

const installCalls = () => calls.filter((c) => c.method === 'installAndEnable')

beforeEach(() => {
  calls = []
  launchLinks = []
  handlers.clear()
  resetLaunchLinksForTest()
  focusMock.mockClear()
})
afterEach(async () => { cleanup(); await settleRpc(); mock.restore() })

test('an install link opens the package and asks before installing', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')

  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(dialog).toHaveTextContent('Filesystem'))
  expect(dialog).toHaveTextContent('filesystem · v0.8.1')
  expect(dialog).toHaveTextContent('anthropic')
  expect(dialog).toHaveTextContent('官方')
  expect(dialog).toHaveTextContent('MCP')
  expect(dialog).toHaveTextContent('script · npm install -g @mcp/filesystem')
  expect(dialog).toHaveTextContent('启动命令：npx -y @mcp/filesystem')
  expect(dialog).toHaveTextContent('这次安装由网页链接发起')

  expect(installCalls()).toHaveLength(0)
  expect(focusMock).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('selected')).toHaveTextContent('filesystem')
  expect(screen.getByTestId('nav')).toHaveTextContent('browse')
  expect(screen.getByTestId('category')).toHaveTextContent('mcp')
})

test('cancel is the default focus and installs nothing', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')
  await screen.findByRole('button', { name: '确认安装' })

  const cancel = screen.getByRole('button', { name: '取消' })
  expect(document.activeElement).toBe(cancel)
  await click('取消')

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(installCalls()).toHaveLength(0)
  expect(screen.getByTestId('log')).toHaveTextContent('')
})

test('confirming runs the existing install with only the slug', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem&url=https%3A%2F%2Fevil.example%2Fx.sh&command=curl+evil&apiKey=sk-1')
  await click('确认安装')

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(installCalls()).toEqual([{ method: 'installAndEnable', args: ['filesystem'] }])
  expect(JSON.stringify(calls)).not.toContain('evil')
  expect(screen.getByTestId('log')).toHaveTextContent('$ aas install filesystem|✓ 已安装 filesystem 0.8.1')
})

test('a skill from a community publisher shows its tier and default steps', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=pdf-tools&category=skill')

  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(dialog).toHaveTextContent('PDF Tools'))
  expect(dialog).toHaveTextContent('someone')
  expect(dialog).toHaveTextContent('社区')
  expect(dialog).toHaveTextContent('技能')
  expect(dialog).toHaveTextContent('~/.agents/skills/pdf-tools')
  expect(dialog).toHaveTextContent('下载地址：https://example.test/pdf-tools.md')
})

test('a provider opens its configuration after the confirmed install', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=openrouter')

  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(dialog).toHaveTextContent('密钥在那里填写'))
  expect(screen.getByTestId('editing')).toHaveTextContent('')
  await click('确认安装')

  await waitFor(() => expect(screen.getByTestId('editing')).toHaveTextContent('openrouter'))
  expect(installCalls()).toEqual([{ method: 'installAndEnable', args: ['openrouter'] }])
})

test('an unknown slug is reported and nothing is installed', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=no-such-package')

  const dialog = await screen.findByRole('dialog', { name: '没有找到这个包' })
  expect(dialog).toHaveTextContent('no-such-package')
  expect(screen.queryByRole('button', { name: '确认安装' })).not.toBeInTheDocument()
  await click('关闭')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(installCalls()).toHaveLength(0)
  expect(screen.getByTestId('selected')).toHaveTextContent('')
})

test('a catalog failure is reported and nothing is installed', async () => {
  mockRpc({ search: () => { throw new Error('catalog unreachable') } })
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')

  const dialog = await screen.findByRole('dialog', { name: '目录暂时取不到' })
  expect(dialog).toHaveTextContent('catalog unreachable')
  expect(installCalls()).toHaveLength(0)
})

test('an empty catalog (offline, no cache) is a catalog failure, not a missing package', async () => {
  mockRpc({ search: () => [] })
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')

  await screen.findByRole('dialog', { name: '目录暂时取不到' })
  expect(installCalls()).toHaveLength(0)
})

test('an already installed package offers to view it instead', async () => {
  mockRpc({ info: () => ({ slug: 'filesystem', category: 'mcp' }) })
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')

  await screen.findByRole('dialog', { name: '已经安装过了' })
  expect(screen.queryByRole('button', { name: '确认安装' })).not.toBeInTheDocument()
  expect(screen.getByTestId('selected')).toHaveTextContent('')
  await click('查看')

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByTestId('selected')).toHaveTextContent('filesystem')
  expect(screen.getByTestId('nav')).toHaveTextContent('browse')
  expect(installCalls()).toHaveLength(0)
})

test('a malformed link is reported without touching the catalog', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=..%2F..%2Fetc')

  await screen.findByRole('dialog', { name: '无法识别的链接' })
  expect(calls).toHaveLength(0)
})

test('a category that contradicts the catalog stops before the confirmation', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem&category=skill')

  await screen.findByRole('dialog', { name: '链接与目录不一致' })
  expect(screen.queryByRole('button', { name: '确认安装' })).not.toBeInTheDocument()
  expect(installCalls()).toHaveLength(0)
})

test('a failed install is reported in the dialog and the log', async () => {
  mockRpc({ installAndEnable: () => { throw new Error('hook exited 1') } })
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')
  await click('确认安装')

  const dialog = await screen.findByRole('dialog', { name: '安装失败' })
  expect(dialog).toHaveTextContent('hook exited 1')
  expect(screen.getByTestId('log')).toHaveTextContent('✗ hook exited 1')
})

test('a link that launched the app is picked up once the UI mounts', async () => {
  mockRpc()
  launchLinks = ['agent-store://install?slug=filesystem']
  await renderDialog()

  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(dialog).toHaveTextContent('Filesystem'))
  expect(installCalls()).toHaveLength(0)
})

test('the launch link arriving again as an event does not restart the flow', async () => {
  mockRpc()
  launchLinks = ['agent-store://install?slug=filesystem']
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')

  await screen.findByRole('button', { name: '确认安装' })
  await openLink('agent-store://install?slug=filesystem')
  expect(calls.filter((c) => c.method === 'search')).toHaveLength(1)
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
})

test('the sign-in callback is left to the auth handler', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://auth-callback?token=tok123')

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(calls).toHaveLength(0)
  expect(focusMock).not.toHaveBeenCalled()
})
