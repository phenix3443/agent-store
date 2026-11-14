import { test, expect, afterEach, beforeEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor, act, within } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { useEffect } from 'react'
import { TerminalLogProvider, useTerminalLog } from '../../state/TerminalLog'
import { ProjectsProvider, useProjects } from '../../state/Projects'
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

const { InstallDialog, resetLaunchLinksForTest } = await import('../install/InstallDialog')

const publisher = { id: 'p', slug: 'anthropic', name: 'anthropic', avatarUrl: '', tier: 'official' as const }
const base = {
  id: 'i', version: '0.8.1', publisher, compatibleWith: ['claude'], tags: [], downloads: 10,
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

const SITE: Record<string, string> = { mcp: 'mcp-registry', skill: 'github', provider: 'builtin' }
const idOf = (item: { slug: string; category: string }) => `${SITE[item.category]}:io.example/${item.slug}`

/** GET /api/resources/<id> as the engine returns it: the entry plus its install preview. */
function entry(item: typeof mcpItem | typeof skillItem | typeof providerItem) {
  const id = idOf(item)
  return {
    id, kind: item.category, name: item.name, description: item.description, author: { name: item.publisher.name, url: null },
    version: item.version, homepageUrl: null, installs: null, verified: item.publisher.tier !== 'community', tags: [], transports: [],
    origin: { site: SITE[item.category], upstreamId: `io.example/${item.slug}`, url: null, upstreamVersion: null, upstreamUpdatedAt: null, syncedAt: '', unavailableAt: null, unavailableReason: null },
    slug: item.slug, install: { ...item, resourceId: id },
  }
}
const catalog = [mcpItem, skillItem, providerItem].map(entry)

function mockRpc(overrides: Record<string, (...args: unknown[]) => unknown> = {}) {
  const defaults: Record<string, (...args: unknown[]) => unknown> = {
    list: () => [],
    getResource: (ref) => {
      const found = catalog.find((r) => r.id === ref || r.slug === ref)
      if (!found) throw new rpcModule.RpcError(`Not in the catalog: ${String(ref)}`, 'ResourceNotFoundError', { reason: 'not-found' })
      return found
    },
    installAndEnable: (ref) => ({ slug: catalog.find((r) => r.id === ref)?.slug, version: '0.8.1', enabled: ['claude'], notEnabled: [] }),
    install: (ref) => ({ slug: catalog.find((r) => r.id === ref)?.slug, version: '0.8.1' }),
    getTargetStatus: () => [
      { target: 'claude', compatible: true, enabled: false },
      { target: 'codex', compatible: false, enabled: false, blocker: { reason: 'incompatible', message: 'no' } },
    ],
    enable: () => undefined,
    setConfig: () => undefined,
  }
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push({ method, args })
    const handler = overrides[method] ?? defaults[method]
    if (!handler) throw new Error(`unexpected RPC: ${method}`)
    return handler(...args)
  }) as typeof rpcModule.callRpc)
}

function Probe() {
  const { selectedSlug, navView, categoryFilter, editingConfigSlug, projectId } = useAppState()
  const { lines } = useTerminalLog()
  return (
    <div>
      <span data-testid="selected">{selectedSlug ?? ''}</span>
      <span data-testid="nav">{navView}</span>
      <span data-testid="category">{categoryFilter}</span>
      <span data-testid="editing">{editingConfigSlug ?? ''}</span>
      <span data-testid="log">{lines.map((l) => l.text).join('|')}</span>
      <span data-testid="project">{projectId ?? ''}</span>
    </div>
  )
}

async function renderDialog(extra?: React.ReactNode) {
  render(
    <AppStateProvider>
      <TerminalLogProvider>
        <Probe />
        {extra}
        <InstallDialog />
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

async function click(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

const rpc = (method: string) => calls.filter((c) => c.method === method)
const installCalls = () => calls.filter((c) => c.method === 'installAndEnable' || c.method === 'install')

beforeEach(() => {
  calls = []
  launchLinks = []
  handlers.clear()
  resetLaunchLinksForTest()
  focusMock.mockClear()
})
afterEach(async () => { cleanup(); await settleRpc(); mock.restore() })

test('an install link shows the entry, the agents and what installing writes, and asks first', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')

  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(dialog).toHaveTextContent('Filesystem'))
  expect(dialog).toHaveTextContent('mcp-registry:io.example/filesystem · v0.8.1')
  expect(dialog).toHaveTextContent('发布者 anthropic · MCP')
  expect(dialog).toHaveTextContent('script · npm install -g @mcp/filesystem')
  expect(dialog).toHaveTextContent('启动命令：npx -y @mcp/filesystem')
  expect(dialog).toHaveTextContent('这次安装由网页链接发起')
  expect(within(dialog).getByRole('switch', { name: 'Claude Code' })).toBeChecked()
  expect(within(dialog).getByRole('switch', { name: 'Codex' })).toBeDisabled()
  expect(dialog).toHaveTextContent('这个资源不支持 Codex。')

  expect(installCalls()).toHaveLength(0)
  expect(focusMock).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('selected')).toHaveTextContent('mcp-registry:io.example/filesystem')
  expect(screen.getByTestId('category')).toHaveTextContent('all')
})

test('installing an MCP installs, then enables each chosen agent, and ends on the summary', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=whatever-old&category=mcp&id=mcp-registry%3Aio.example%2Ffilesystem')
  await screen.findByRole('button', { name: '安装' })
  await click('安装')

  const dialog = await screen.findByRole('dialog', { name: '已安装 Filesystem' })
  expect(dialog).toHaveTextContent('已对 Claude Code 启用。')
  expect(rpc('getResource')).toEqual([{ method: 'getResource', args: ['mcp-registry:io.example/filesystem'] }])
  expect(rpc('install')).toEqual([{ method: 'install', args: ['mcp-registry:io.example/filesystem'] }])
  expect(rpc('enable')).toEqual([{ method: 'enable', args: ['filesystem', 'claude'] }])
  expect(screen.getByTestId('log')).toHaveTextContent('$ aas install mcp-registry:io.example/filesystem|✓ 已安装 filesystem 0.8.1|$ aas enable filesystem --for claude')

  await click('查看')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByTestId('selected')).toHaveTextContent('filesystem')
  expect(screen.getByTestId('category')).toHaveTextContent('mcp')
})

test('cancel is the default focus for a web link and installs nothing', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')
  await screen.findByRole('button', { name: '安装' })

  const cancel = screen.getByRole('button', { name: '取消' })
  await waitFor(() => expect(document.activeElement === cancel).toBe(true))
  await click('取消')

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(installCalls()).toHaveLength(0)
  expect(screen.getByTestId('log')).toHaveTextContent('')
})

test('nothing a link carries besides the id reaches the install', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem&url=https%3A%2F%2Fevil.example%2Fx.sh&command=curl+evil&apiKey=sk-1')
  await screen.findByRole('button', { name: '安装' })
  await click('安装')

  await screen.findByRole('dialog', { name: '已安装 Filesystem' })
  expect(JSON.stringify(calls)).not.toContain('evil')
  expect(JSON.stringify(calls)).not.toContain('sk-1')
})

test('turning every agent off installs without enabling', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')
  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Claude Code' }))
  })
  await click('只安装，不启用')

  expect(await screen.findByText('已安装，尚未对任何 agent 启用。')).toBeInTheDocument()
  expect(rpc('install')).toHaveLength(1)
  expect(rpc('enable')).toHaveLength(0)
})

test('an MCP with required fields asks for them, saves them, then enables', async () => {
  const id = 'mcp-registry:io.example/filesystem'
  const withKey = catalog.map((r) =>
    r.id === id ? { ...r, install: { ...r.install, configSchema: { properties: { token: { description: 'Token', 'x-secret': true } }, required: ['token'] } } } : r
  )
  mockRpc({ getResource: (ref) => withKey.find((r) => r.id === ref || r.slug === ref) })
  await renderDialog()
  await openLink(`agent-store://install?id=${encodeURIComponent(id)}`)
  await screen.findByRole('button', { name: '下一步：填写必填项' })
  await click('下一步：填写必填项')

  await screen.findByRole('dialog', { name: '填写必填项' })
  expect(screen.getByRole('button', { name: '安装' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/Token/), { target: { value: 'tok-1' } })
  await click('安装')

  await screen.findByRole('dialog', { name: '已安装 Filesystem' })
  expect(rpc('setConfig')).toEqual([{ method: 'setConfig', args: ['filesystem', { token: 'tok-1' }] }])
  expect(rpc('enable')).toHaveLength(1)
})

test('稍后填写 installs, leaves it disabled and offers the configuration', async () => {
  const id = 'mcp-registry:io.example/filesystem'
  const withKey = catalog.map((r) => (r.id === id ? { ...r, install: { ...r.install, configSchema: { properties: { token: {} }, required: ['token'] } } } : r))
  mockRpc({
    getResource: (ref) => withKey.find((r) => r.id === ref || r.slug === ref),
    getTargetStatus: () => [{ target: 'claude', compatible: true, enabled: false, blocker: { reason: 'needs-config', message: 'token' } }],
  })
  await renderDialog()
  await openLink(`agent-store://install?id=${encodeURIComponent(id)}`)
  await screen.findByRole('button', { name: '下一步：填写必填项' })
  await click('下一步：填写必填项')
  await click('稍后填写')

  expect(await screen.findByText('已安装。填完必填项后才能启用。')).toBeInTheDocument()
  expect(rpc('setConfig')).toHaveLength(0)
  expect(rpc('enable')).toHaveLength(0)
  expect(screen.getByRole('button', { name: '打开配置' })).toBeInTheDocument()
})

test('a same-name MCP entry pauses the install until the agent is skipped', async () => {
  mockRpc({ enable: () => { throw new rpcModule.RpcError('exists', 'McpConflictError', { tool: 'claude' }) } })
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')
  await screen.findByRole('button', { name: '安装' })
  await click('安装')

  expect(await screen.findByText('Claude Code 里已经有一条同名的 MCP 配置')).toBeInTheDocument()
  await click('跳过 Claude Code')
  const dialog = await screen.findByRole('dialog', { name: '已安装 Filesystem' })
  expect(dialog).toHaveTextContent('已跳过：保留了原有的同名条目')
})

test('a same-name MCP entry can be replaced from the install, saying what changes and what does not', async () => {
  mockRpc({
    enable: (_s, _t, opts) => {
      if (!(opts as { replace?: boolean } | undefined)?.replace) throw new rpcModule.RpcError('exists', 'McpConflictError', { tool: 'claude' })
    },
  })
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')
  await screen.findByRole('button', { name: '安装' })
  await click('安装')

  const paused = await screen.findByRole('dialog', { name: '正在安装 Filesystem' })
  await waitFor(() => expect(paused).toHaveTextContent('把原条目保存到 ~/.agent-store/mcps/filesystem/targets.json'))
  expect(paused).toHaveTextContent('先用 Claude Code 的命令行在临时目录里试写一次原条目')
  expect(paused).toHaveTextContent('~/.claude.json 里的其他 MCP 条目')
  await click('替换现有条目')
  const dialog = await screen.findByRole('dialog', { name: '已安装 Filesystem' })
  expect(dialog).toHaveTextContent('已替换原有条目，原条目已保存')
  expect(rpc('enable').map((c) => c.args)).toEqual([['filesystem', 'claude'], ['filesystem', 'claude', { replace: true }]])
})

test('a skill shows its library path and is installed and linked in one call', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=pdf-tools&category=skill')

  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(dialog).toHaveTextContent('PDF Tools'))
  expect(dialog).toHaveTextContent('someone')
  expect(dialog).toHaveTextContent('~/.agent-store/skills/pdf-tools')
  expect(dialog).toHaveTextContent('下载地址：https://example.test/pdf-tools.md')
  await click('安装')
  await screen.findByRole('dialog', { name: '已安装 PDF Tools' })
  expect(rpc('installAndEnable')).toEqual([{ method: 'installAndEnable', args: ['github:io.example/pdf-tools'] }])
})

test('a provider install ends on 打开配置, which opens its config', async () => {
  mockRpc({ installAndEnable: () => ({ slug: 'openrouter', version: '1', enabled: [], notEnabled: [{ target: 'claude', reason: 'no-key', message: '' }] }) })
  await renderDialog()
  await openLink('agent-store://install?slug=openrouter')

  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(dialog).toHaveTextContent('配置页填写 API 密钥'))
  await click('安装')
  expect(await screen.findByText('已添加。填入 API 密钥后才能对 agent 启用。')).toBeInTheDocument()
  await click('打开配置')
  await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('openrouter'))
  expect(screen.getByTestId('category')).toHaveTextContent('provider')
  expect(rpc('installAndEnable')).toEqual([{ method: 'installAndEnable', args: ['builtin:io.example/openrouter'] }])
})

test('a provider that already has a config gets another one', async () => {
  mockRpc({ list: () => [{ slug: 'openrouter', category: 'provider', resourceId: 'builtin:io.example/openrouter' }], duplicateProvider: () => ({ newSlug: 'openrouter-copy' }) })
  await renderDialog()
  await openLink('agent-store://install?slug=openrouter')
  await screen.findByRole('button', { name: '添加配置' })
  await click('添加配置')
  await screen.findByRole('dialog', { name: '已安装 OpenRouter' })
  expect(rpc('duplicateProvider')).toEqual([{ method: 'duplicateProvider', args: ['openrouter'] }])
  expect(installCalls()).toHaveLength(0)
})

test('an unknown slug is reported and nothing is installed', async () => {
  mockRpc()
  await renderDialog()
  await openLink('agent-store://install?slug=no-such-package')

  const dialog = await screen.findByRole('dialog', { name: '没有找到这个资源' })
  expect(dialog).toHaveTextContent('no-such-package')
  await click('关闭')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(installCalls()).toHaveLength(0)
  expect(screen.getByTestId('selected')).toHaveTextContent('')
})

test('a catalog failure is reported and nothing is installed', async () => {
  mockRpc({ getResource: () => { throw new Error('catalog unreachable') } })
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')

  const dialog = await screen.findByRole('dialog', { name: '目录暂时取不到' })
  expect(dialog).toHaveTextContent('catalog unreachable')
  expect(installCalls()).toHaveLength(0)
})

test('an already installed package offers to view it instead', async () => {
  mockRpc({ list: () => [{ slug: 'filesystem', category: 'mcp', resourceId: 'mcp-registry:io.example/filesystem' }] })
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')

  await screen.findByRole('dialog', { name: '已经安装过了' })
  await click('查看')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByTestId('selected')).toHaveTextContent('filesystem')
  expect(screen.getByTestId('category')).toHaveTextContent('mcp')
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
  expect(screen.queryByRole('button', { name: '安装' })).not.toBeInTheDocument()
})

test('a failed install is reported with a retry, and logged', async () => {
  mockRpc({ install: () => { throw new Error('hook exited 1') } })
  await renderDialog()
  await openLink('agent-store://install?slug=filesystem')
  await screen.findByRole('button', { name: '安装' })
  await click('安装')

  const dialog = await screen.findByRole('dialog', { name: 'Filesystem 没有装上' })
  expect(dialog).toHaveTextContent('hook exited 1')
  expect(screen.getByTestId('log')).toHaveTextContent('✗ hook exited 1')
  await click('重试')
  expect(await screen.findByRole('button', { name: '安装' })).toBeInTheDocument()
})

test('the 安装 buttons in the app open the same dialog, focused on install', async () => {
  mockRpc()
  function Ask() {
    const { requestInstall } = useAppState()
    useEffect(() => requestInstall('mcp-registry:io.example/filesystem'), [requestInstall])
    return null
  }
  await renderDialog(<Ask />)
  const dialog = await screen.findByRole('dialog', { name: '安装 Filesystem' })
  expect(dialog).not.toHaveTextContent('这次安装由网页链接发起')
  const install = within(dialog).getByRole('button', { name: '安装' })
  await waitFor(() => expect(document.activeElement === install).toBe(true))
  expect(focusMock).not.toHaveBeenCalled()
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

  await screen.findByRole('button', { name: '安装' })
  await openLink('agent-store://install?slug=filesystem')
  expect(rpc('getResource')).toHaveLength(1)
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

// ── Install location: a registered project (#166) ────────────────────────────

const demo = { id: 'p1', path: '/w/demo', name: 'demo', addedAt: '2026-11-01T00:00:00Z', exists: true }
const gone = { id: 'p2', path: '/w/gone', name: 'gone', addedAt: '2026-11-01T00:00:00Z', exists: false }
const skillId = 'github:io.example/pdf-tools'
const mcpId = 'mcp-registry:io.example/filesystem'

function projectResult(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'p1', slug: 'pdf-tools', kind: 'skill', version: '0.8.1', name: 'pdf-tools',
    installed: [{ agent: 'claude', file: '/w/demo/.claude/skills/pdf-tools' }], skipped: [], env: [], codexTrusted: false,
    ...overrides,
  }
}

async function renderWithProjects(extra?: React.ReactNode) {
  render(
    <AppStateProvider>
      <TerminalLogProvider>
        <ProjectsProvider>
          <Probe />
          {extra}
          <InstallDialog />
        </ProjectsProvider>
      </TerminalLogProvider>
    </AppStateProvider>
  )
  await waitFor(() => expect(handlers.size).toBe(1))
  await waitFor(() => expect(rpc('listProjects')).toHaveLength(1))
  await settleRpc(5)
}

function location(dialog: HTMLElement) {
  return within(dialog).getByRole('combobox', { name: '安装位置' }) as HTMLSelectElement
}

test('a skill can go into a registered project instead of the global library', async () => {
  mockRpc({ listProjects: () => [demo, gone], installToProject: () => projectResult() })
  await renderWithProjects()
  await openLink(`agent-store://install?id=${encodeURIComponent(skillId)}`)
  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(dialog).toHaveTextContent('PDF Tools'))

  const select = location(dialog)
  expect(select.value).toBe('')
  const options = Array.from(select.options)
  expect(options.map((o) => o.textContent)).toEqual(['全局 · 对所有项目生效', '项目 demo · /w/demo', '项目 gone · /w/gone · 目录不存在', '添加项目…'])
  expect(options[2].disabled).toBe(true)

  await act(async () => {
    fireEvent.change(select, { target: { value: 'p1' } })
  })
  expect(dialog).toHaveTextContent('会写入项目目录并随版本库提交')
  expect(dialog).toHaveTextContent('复制到 /w/demo/.claude/skills/')
  expect(dialog).not.toHaveTextContent('~/.agent-store/skills')
  await click('安装到 demo')

  const done = await screen.findByRole('dialog', { name: '已安装 PDF Tools' })
  expect(done).toHaveTextContent('已写入项目 demo。提交到版本库后，队友拉取即可使用。')
  expect(done).toHaveTextContent('.claude/skills/pdf-tools')
  expect(rpc('installToProject')).toEqual([{ method: 'installToProject', args: ['p1', skillId] }])
  expect(installCalls()).toHaveLength(0)
  expect(screen.getByTestId('log')).toHaveTextContent(`$ aas install ${skillId} --project /w/demo`)

  await click('打开项目')
  expect(screen.getByTestId('nav')).toHaveTextContent('project')
  expect(screen.getByTestId('project')).toHaveTextContent('p1')
})

test('a project MCP install writes references, then stores the keys on this machine', async () => {
  const withKey = catalog.map((r) =>
    r.id === mcpId ? { ...r, install: { ...r.install, configSchema: { properties: { token: { 'x-secret': true, 'x-env': 'FS_TOKEN' } }, required: ['token'] } } } : r
  )
  mockRpc({
    listProjects: () => [demo],
    getResource: (ref) => withKey.find((r) => r.id === ref || r.slug === ref),
    installToProject: () => projectResult({ slug: 'filesystem', kind: 'mcp', name: 'filesystem', installed: [{ agent: 'claude', file: '/w/demo/.mcp.json' }], env: ['FS_TOKEN'] }),
    getProject: () => ({ ...demo, codexTrusted: false, skills: [], mcps: [], env: [{ name: 'FS_TOKEN', stored: false, usedBy: ['filesystem'] }] }),
    setProjectEnv: () => undefined,
  })
  await renderWithProjects()
  await openLink(`agent-store://install?id=${encodeURIComponent(mcpId)}`)
  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(dialog).toHaveTextContent('Filesystem'))
  await act(async () => {
    fireEvent.change(location(dialog), { target: { value: 'p1' } })
  })
  expect(dialog).toHaveTextContent('Claude Code 首次使用需批准，Codex 需信任该项目后才生效。')
  expect(dialog).toHaveTextContent('写入 /w/demo/.mcp.json › mcpServers.filesystem')
  expect(dialog).toHaveTextContent('必填值只写变量引用 ${FS_TOKEN}')
  await click('安装到 demo')

  await screen.findByRole('dialog', { name: '把密钥存到本机' })
  expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('FS_TOKEN'), { target: { value: 'tok-9' } })
  await click('保存')

  const done = await screen.findByRole('dialog', { name: '已安装 Filesystem' })
  expect(done).toHaveTextContent('提交到版本库后，队友拉取即可使用。')
  expect(rpc('setProjectEnv')).toEqual([{ method: 'setProjectEnv', args: ['p1', 'FS_TOKEN', 'tok-9'] }])
  expect(rpc('setConfig')).toHaveLength(0)
  expect(installCalls()).toHaveLength(0)
  expect(screen.getByTestId('log')).not.toHaveTextContent('tok-9')
})

test('skipping the keys of a project install says where to enter them later', async () => {
  mockRpc({
    listProjects: () => [demo],
    installToProject: () => projectResult({ slug: 'filesystem', kind: 'mcp', name: 'filesystem', env: ['FS_TOKEN'] }),
    getProject: () => ({ ...demo, codexTrusted: false, skills: [], mcps: [], env: [{ name: 'FS_TOKEN', stored: false, usedBy: ['filesystem'] }] }),
  })
  await renderWithProjects()
  await openLink(`agent-store://install?id=${encodeURIComponent(mcpId)}`)
  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(dialog).toHaveTextContent('Filesystem'))
  await act(async () => {
    fireEvent.change(location(dialog), { target: { value: 'p1' } })
  })
  await click('安装到 demo')
  await screen.findByRole('dialog', { name: '把密钥存到本机' })
  await click('稍后填写')
  expect(await screen.findByText(/本机还没有填写密钥，可在项目页填写。/)).toBeInTheDocument()
})

test('an edited project copy is replaced only after 仍然替换', async () => {
  let n = 0
  mockRpc({
    listProjects: () => [demo],
    installToProject: () => {
      n += 1
      if (n === 1) throw new rpcModule.RpcError('edited since; pass --force', 'ProjectConflictError', { reason: 'modified', tool: 'claude' })
      return projectResult()
    },
  })
  await renderWithProjects()
  await openLink(`agent-store://install?id=${encodeURIComponent(skillId)}`)
  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(dialog).toHaveTextContent('PDF Tools'))
  await act(async () => {
    fireEvent.change(location(dialog), { target: { value: 'p1' } })
  })
  await click('安装到 demo')

  const failed = await screen.findByRole('dialog', { name: 'PDF Tools 没有装上' })
  expect(failed).toHaveTextContent('Agent Store 写入的 Claude Code 条目之后被改过，没有替换。')
  await click('仍然替换')
  await screen.findByRole('dialog', { name: '已安装 PDF Tools' })
  expect(rpc('installToProject').map((c) => c.args)).toEqual([['p1', skillId], ['p1', skillId, { force: true }]])
})

test('an MCP that runs downloaded files is refused for a project, with the reason', async () => {
  mockRpc({
    listProjects: () => [demo],
    installToProject: () => {
      throw new rpcModule.RpcError('runs files Agent Store downloads', 'ProjectMcpUnsupportedError', { reason: 'not-portable' })
    },
  })
  await renderWithProjects()
  await openLink(`agent-store://install?id=${encodeURIComponent(mcpId)}`)
  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(dialog).toHaveTextContent('Filesystem'))
  await act(async () => {
    fireEvent.change(location(dialog), { target: { value: 'p1' } })
  })
  await click('安装到 demo')
  const failed = await screen.findByRole('dialog', { name: 'Filesystem 没有装上' })
  expect(failed).toHaveTextContent('队友没有这些文件，只能全局安装')
  expect(screen.queryByRole('button', { name: '仍然替换' })).not.toBeInTheDocument()
})

test('from a project page, an item installed globally goes straight to that project', async () => {
  mockRpc({ listProjects: () => [demo], list: () => [{ slug: 'filesystem', category: 'mcp', resourceId: mcpId }] })
  // As from a project page: the project list has loaded before 安装 is pressed.
  function Ask() {
    const { requestInstall, setInstallInto } = useAppState()
    const { projects } = useProjects()
    useEffect(() => {
      if (!projects.length) return
      setInstallInto('p1')
      requestInstall(mcpId)
    }, [projects.length, requestInstall, setInstallInto])
    return null
  }
  await renderWithProjects(<Ask />)
  const dialog = await screen.findByRole('dialog', { name: '安装 Filesystem' })
  const select = location(dialog)
  expect(select.value).toBe('p1')
  expect(select.options[0].textContent).toBe('全局 · 已安装')
  expect(select.options[0].disabled).toBe(true)
  expect(within(dialog).getByRole('button', { name: '安装到 demo' })).toBeEnabled()
})

test('the already-installed notice offers a project when one is registered', async () => {
  mockRpc({ listProjects: () => [demo], list: () => [{ slug: 'filesystem', category: 'mcp', resourceId: mcpId }] })
  await renderWithProjects()
  await openLink('agent-store://install?slug=filesystem')
  await screen.findByRole('dialog', { name: '已经安装过了' })
  await click('安装到项目…')
  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  expect(location(dialog).value).toBe('p1')
})

test('添加项目… in the location list registers a folder and comes back with it chosen', async () => {
  const list = [demo]
  const added = { id: 'p3', path: '/w/new', name: 'new', addedAt: '2026-11-14T00:00:00Z', exists: true }
  mockRpc({
    listProjects: () => [...list],
    addProject: () => {
      list.push(added)
      return added
    },
  })
  await renderWithProjects()
  await openLink(`agent-store://install?id=${encodeURIComponent(skillId)}`)
  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(dialog).toHaveTextContent('PDF Tools'))
  await act(async () => {
    fireEvent.change(location(dialog), { target: { value: '__add' } })
  })
  await screen.findByRole('dialog', { name: '添加项目' })
  fireEvent.change(screen.getByLabelText('项目目录'), { target: { value: '/w/new' } })
  await click('添加项目')

  const back = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(location(back).value).toBe('p3'))
  expect(rpc('addProject')).toEqual([{ method: 'addProject', args: ['/w/new'] }])
})

test('a project that already has the item is greyed out in the location list', async () => {
  const other = { id: 'p2', path: '/w/other', name: 'other', addedAt: '2026-11-01T00:00:00Z', exists: true }
  mockRpc({
    listProjects: () => [demo, other],
    projectSummaries: () => [
      { ...demo, skills: 1, mcps: 0, installed: [{ kind: 'skill', slug: 'pdf-tools', resourceId: skillId, name: 'pdf-tools' }] },
      { ...other, skills: 0, mcps: 0, installed: [] },
    ],
  })
  await renderWithProjects()
  await openLink(`agent-store://install?id=${encodeURIComponent(skillId)}`)
  const dialog = await screen.findByRole('dialog', { name: '确认安装' })
  await waitFor(() => expect(location(dialog).options[1].disabled).toBe(true))
  const select = location(dialog)
  expect(select.options[1].textContent).toContain('已在这个项目中')
  expect(select.options[2].disabled).toBe(false)
})
