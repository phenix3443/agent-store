import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { settleRpc } from '../../test/settle'

const openMock = mock(async () => {})
mock.module('../../lib/openExternal', () => ({ openExternal: openMock }))
mock.module('../../lib/deepLink', () => ({ onDeepLink: async () => () => {} }))

mock.module('../../lib/storeAuth', () => ({
  getStoreBaseUrl: () => 'https://store.test',
  getAuthScheme: () => 'agent-store',
  emailFromJwt: () => 'dev@example.com',
  AUTH_REDIRECT_URL: 'agent-store://auth-callback',
}))

const { SettingsView } = await import('../SettingsView')
const { AppStateProvider, useAppState } = await import('../../state/AppState')
const { EntitlementProvider } = await import('../../state/Entitlement')
const { AuthProvider } = await import('../../state/Auth')
const { TerminalLogProvider, useTerminalLog } = await import('../../state/TerminalLog')
const { I18nProvider } = await import('../../i18n')

afterEach(async () => {
  cleanup()
  await settleRpc()
  mock.restore()
  openMock.mockClear()
})

type Handler = (method: string, args: unknown[]) => unknown

function Probe() {
  const { agentApp, shellDialog } = useAppState()
  const { lines } = useTerminalLog()
  return <div data-testid="probe">{`${agentApp}:${shellDialog ?? '-'}:${lines.map((l) => l.text).join('|')}`}</div>
}

function renderView(extra: Handler = () => undefined, plan = 'free') {
  const calls: [string, unknown[]][] = []
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push([method, args])
    const out = extra(method, args)
    if (out !== undefined) return out
    if (method === 'getEntitlements')
      return plan === 'pro'
        ? { plan: 'pro', advancedUsageAnalytics: true, smartRouting: true, keyRotation: true }
        : { plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }
    if (method === 'createCheckout') return { checkoutUrl: 'https://pay.example/cs_1' }
    if (method === 'checkUpdates') return []
    if (method === 'list') return []
    throw new Error(`unexpected RPC in SettingsView test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(
    <I18nProvider>
      <AppStateProvider>
        <EntitlementProvider>
          <AuthProvider>
            <TerminalLogProvider>
              <SettingsView />
              <Probe />
            </TerminalLogProvider>
          </AuthProvider>
        </EntitlementProvider>
      </AppStateProvider>
    </I18nProvider>
  )
  return calls
}

function openTab(name: string) {
  const tab = screen.getByRole('tab', { name })
  fireEvent.mouseDown(tab)
  fireEvent.click(tab)
  expect(tab).toHaveAttribute('aria-selected', 'true')
}

test('has six tabs and opens on General', () => {
  localStorage.setItem('as-locale', 'zh')
  renderView()
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['通用', 'Agent', '数据', '账号', '命令行', '关于'])
  expect(screen.getByRole('tab', { name: '通用' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('当前只提供深色主题。')).toBeInTheDocument()
  expect(screen.queryByText(/同步/)).toBeNull()
})

test('General switches the language, the target agent, and opens shortcuts and the welcome', () => {
  localStorage.setItem('as-locale', 'zh')
  renderView()
  fireEvent.click(screen.getByRole('button', { name: 'Codex' }))
  expect(screen.getByTestId('probe').textContent).toBe('codex:-:')
  fireEvent.click(screen.getByRole('button', { name: '查看' }))
  expect(screen.getByTestId('probe').textContent).toBe('codex:shortcuts:')
  fireEvent.click(screen.getByRole('button', { name: '重新查看' }))
  expect(screen.getByTestId('probe').textContent).toBe('codex:welcome:')

  const language = within(screen.getByRole('group', { name: '界面语言' }))
  expect(language.getAllByRole('button').map((b) => b.textContent)).toEqual(['中文', 'English'])
  fireEvent.click(language.getByRole('button', { name: 'English' }))
  expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument()
  localStorage.setItem('as-locale', 'zh')
})

test('Agents shows what was detected, the import entry, and runs doctor', async () => {
  localStorage.setItem('as-locale', 'zh')
  const calls = renderView((method) => {
    if (method === 'doctor') return [{ level: 'warn', code: 'mcp-shadowed', slug: 'ctx', message: 'project scope overrides it' }]
    if (method === 'detectAgents')
      return [
        { agent: 'claude', binary: '/usr/bin/claude', version: '2.1.80 (Claude Code)', configDir: '/h/.claude', configDirExists: true, mcpConfigPath: '/h/.claude.json', mcpConfigExists: true, detected: true },
        { agent: 'codex', binary: null, version: null, configDir: '/h/.codex', configDirExists: true, mcpConfigPath: '/h/.codex/config.toml', mcpConfigExists: true, detected: true },
      ]
    if (method === 'listImports') return [{ importId: 'imp-1', createdAt: '2026-11-14T08:00:00Z', state: 'applied', items: [{ kind: 'skill', id: 'skill:a', slug: 'a', agents: ['claude'], paths: [] }] }]
    if (method === 'importUndo') return { importId: 'imp-1', items: [] }
    return undefined
  })
  openTab('Agent')
  expect(screen.getByText('Claude Code')).toBeInTheDocument()
  expect(await screen.findByText('2.1.80 (Claude Code)')).toBeInTheDocument()
  expect(screen.getAllByText('已检测到')).toHaveLength(2)
  expect(screen.getByText('没有找到 codex 命令：MCP 配置改为直接写入 /h/.codex/config.toml，不能接管同名条目。')).toBeInTheDocument()
  expect(screen.getByText('CLAUDE_CONFIG_DIR')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '查找' }))
  expect(screen.getByTestId('probe').textContent).toBe('claude:import:')

  fireEvent.click(await screen.findByRole('button', { name: '撤销' }))
  expect(await screen.findByText('已撤销，文件恢复到导入前的状态')).toBeInTheDocument()
  expect(calls.find(([m]) => m === 'importUndo')![1]).toEqual(['imp-1', {}])

  fireEvent.click(screen.getByRole('button', { name: '开始检查' }))
  expect(await screen.findByText('发现 0 个错误、1 个提醒')).toBeInTheDocument()
  expect(screen.getByText('project scope overrides it')).toBeInTheDocument()
  expect(calls.some(([m]) => m === 'doctor')).toBe(true)
})

test('doctor with no findings says so', async () => {
  localStorage.setItem('as-locale', 'zh')
  renderView((method) => (method === 'doctor' ? [] : undefined))
  openTab('Agent')
  fireEvent.click(screen.getByRole('button', { name: '开始检查' }))
  expect(await screen.findByText('没有发现问题')).toBeInTheDocument()
})

test('Data shows the data paths and the skill count', async () => {
  localStorage.setItem('as-locale', 'zh')
  renderView((method) =>
    method === 'list'
      ? [
          { slug: 'a', category: 'skill' },
          { slug: 'b', category: 'mcp' },
        ]
      : undefined
  )
  openTab('数据')
  expect(screen.getByText('~/.agent-store/')).toBeInTheDocument()
  expect(screen.getByText('~/.agent-store/backups/')).toBeInTheDocument()
  expect(await screen.findByText(/1 个技能/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '复制路径 ~/.agent-store/exports/' })).toBeInTheDocument()
})

test('Account: signed out with both sign-ins, the free plan, upgrade and the Pro feature list', async () => {
  localStorage.setItem('as-locale', 'zh')
  renderView()
  openTab('账号')
  expect(screen.getByText('未登录')).toBeInTheDocument()
  for (const k of ['预算与导出', '智能路由', '多 Key 轮换']) expect(screen.getByText(k)).toBeInTheDocument()
  expect(screen.getAllByText('需要 Pro')).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: /升级到 Pro/ }))
  await waitFor(() => expect(openMock).toHaveBeenCalledWith('https://pay.example/cs_1'))
})

for (const provider of ['GitHub', 'Google']) {
  test(`使用 ${provider} 登录 opens the store relay page`, async () => {
    localStorage.setItem('as-locale', 'zh')
    renderView()
    openTab('账号')
    fireEvent.click(screen.getByRole('button', { name: `使用 ${provider} 登录` }))
    await waitFor(() =>
      expect(openMock).toHaveBeenCalledWith(`https://store.test/auth/desktop?provider=${provider.toLowerCase()}&scheme=agent-store`)
    )
  })
}

test('Account on Pro marks every Pro feature active and has no upgrade button', async () => {
  localStorage.setItem('as-locale', 'zh')
  renderView(undefined, 'pro')
  openTab('账号')
  await waitFor(() => expect(screen.getAllByText('已开通')).toHaveLength(3))
  expect(screen.queryByRole('button', { name: /升级到 Pro/ })).toBeNull()
})

test('CLI lists the aas subcommands', () => {
  localStorage.setItem('as-locale', 'zh')
  renderView()
  openTab('命令行')
  expect(screen.getByText('aas doctor')).toBeInTheDocument()
  expect(screen.getByText('aas relay <start|stop|status>')).toBeInTheDocument()
})

test('About: version, download page, resource updates with update and update all', async () => {
  localStorage.setItem('as-locale', 'zh')
  const updates = [
    { slug: 'a', currentVersion: '1.0.0', latestVersion: '1.1.0' },
    { slug: 'b', currentVersion: '2.0.0', latestVersion: '2.1.0' },
  ]
  const calls = renderView((method) => {
    if (method === 'checkUpdates') return updates
    if (method === 'update') return []
    return undefined
  })
  openTab('关于')
  expect(screen.getByText('Agent Store')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /获取新版本/ }))
  await waitFor(() => expect(openMock).toHaveBeenCalledWith('https://store.test/download'))

  fireEvent.click(screen.getByRole('button', { name: '检查更新' }))
  expect(await screen.findByText('2 项可更新')).toBeInTheDocument()
  expect(screen.getByText('1.0.0 → 1.1.0')).toBeInTheDocument()

  fireEvent.click(screen.getAllByRole('button', { name: '更新' })[0])
  await waitFor(() => expect(calls.some(([m, a]) => m === 'update' && a[0] === 'a')).toBe(true))
  await waitFor(() => expect(screen.getByTestId('probe').textContent).toContain('$ aas update a'))

  await waitFor(() => expect(screen.getByRole('button', { name: '全部更新' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: '全部更新' }))
  await waitFor(() => expect(calls.some(([m, a]) => m === 'update' && a.length === 0)).toBe(true))
})

test('About reports a failed update check', async () => {
  localStorage.setItem('as-locale', 'zh')
  renderView((method) => {
    if (method === 'checkUpdates') throw new Error('offline')
    return undefined
  })
  openTab('关于')
  fireEvent.click(screen.getByRole('button', { name: '检查更新' }))
  expect(await screen.findByText('检查失败：目录暂时取不到')).toBeInTheDocument()
})
