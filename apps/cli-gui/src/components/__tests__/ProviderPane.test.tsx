import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ProviderPane } from '../library/ProviderPane'
import { useTargetToggle } from '../library/useTargetToggle'
import * as rpcModule from '../../lib/rpc'
import { AppStateProvider } from '../../state/AppState'
import { EntitlementProvider } from '../../state/Entitlement'
import { TerminalLogProvider } from '../../state/TerminalLog'
import { TooltipProvider } from '../ui/tooltip'
import { settleRpc } from '../../test/settle'

afterEach(async () => { cleanup(); await settleRpc(); mock.restore() })

const publisher = { id: 'p', slug: 'yls', name: 'yls', avatarUrl: '', tier: 'community' as const }

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) =>
    handlers[method]?.(...args)) as typeof rpcModule.callRpc)
}

function Harness({ slug }: { slug: string }) {
  const toggle = useTargetToggle()
  return <ProviderPane slug={slug} toggle={toggle} onClose={() => {}} onUninstall={() => {}} />
}

function renderWith(slug: string, info: Record<string, unknown>, handlers?: Record<string, (...args: unknown[]) => unknown>) {
  let enabledFor = info.enabledFor as Record<string, boolean>
  mockRpc({
    info: () => ({ ...info, enabledFor }),
    setConfig: () => undefined,
    enable: (_s, target) => { enabledFor = { ...enabledFor, [target as string]: true } },
    disable: (_s, target) => { enabledFor = { ...enabledFor, [target as string]: false } },
    getEntitlements: () => ({ plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }),
    ...handlers,
  })
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <EntitlementProvider>
          <TooltipProvider>
            <Harness slug={slug} />
          </TooltipProvider>
        </EntitlementProvider>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

const ylsInfo = {
  slug: 'yls-me', category: 'provider', version: '0.9.1', installedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude', 'codex'], enabledFor: { claude: false, codex: true },
  name: 'yls-me', description: 'desc', publisher, tags: [], downloads: 0,
  currentConfig: {
    name: '我的配置', apiKey: 'sk-real', baseUrl: 'https://code.ylsagi.com/codex', authType: 'bearer',
    level: 2, whitelist: ['claude-*'], healthCheck: true,
  },
}
const renderPanel = (handlers?: Record<string, (...args: unknown[]) => unknown>) => renderWith('yls-me', ylsInfo, handlers)

const localInfo = {
  slug: 'local', category: 'provider', version: '1.0.0', installedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude', 'codex'], enabledFor: { claude: true },
  name: 'local', description: '内置本地代理', publisher: { ...publisher, tier: 'official' as const }, tags: [], downloads: 0,
}
const renderLocal = (handlers?: Record<string, (...args: unknown[]) => unknown>) => renderWith('local', localInfo, handlers)

const claude = () => screen.getByRole('switch', { name: /^Claude Code/ })
const codex = () => screen.getByRole('switch', { name: /^Codex/ })

test('shows the config name, the masked key and one switch per agent', async () => {
  renderPanel()
  const key = await screen.findByDisplayValue('sk-real')
  expect(key).toHaveAttribute('type', 'password')
  expect(screen.getByDisplayValue('我的配置')).toHaveAttribute('id', 'cli-config-name')
  expect(claude()).not.toBeChecked()
  expect(codex()).toBeChecked()
  expect(screen.getByText('L2')).toBeInTheDocument()
})

test('the key can be shown', async () => {
  renderPanel()
  const key = await screen.findByDisplayValue('sk-real')
  fireEvent.click(screen.getByRole('button', { name: '显示' }))
  expect(key).toHaveAttribute('type', 'text')
})

test('an empty config name shows the inline error', async () => {
  renderPanel()
  const name = await screen.findByDisplayValue('我的配置')
  fireEvent.change(name, { target: { value: '' } })
  expect(await screen.findByText('请先填写配置名称')).toBeInTheDocument()
})

test('a switch calls enable for that agent', async () => {
  const enable = mock(() => undefined)
  renderPanel({ enable })
  await screen.findByDisplayValue('sk-real')
  fireEvent.click(claude())
  await waitFor(() => expect(enable).toHaveBeenCalledWith('yls-me', 'claude'))
})

test('no agent enabled shows the warning', async () => {
  renderPanel()
  await screen.findByDisplayValue('sk-real')
  fireEvent.click(codex())
  expect(await screen.findByText('尚未对任何 agent 启用，这份配置已保存但不会生效。')).toBeInTheDocument()
})

test('a missing key shows the warning', async () => {
  renderPanel()
  const key = await screen.findByDisplayValue('sk-real')
  fireEvent.change(key, { target: { value: '' } })
  expect(await screen.findByText('尚未填写 API 密钥，这份配置已保存但暂时无法使用。')).toBeInTheDocument()
})

test('更多设置 and 高级设置 are folded by default and hold every connection field', async () => {
  renderPanel()
  await screen.findByDisplayValue('sk-real')
  const more = screen.getByText('更多设置').closest('details')!
  const adv = screen.getByText('高级设置').closest('details')!
  expect(more).not.toHaveAttribute('open')
  expect(adv).not.toHaveAttribute('open')
  for (const label of ['API 地址', '官网地址', 'API 端点', '上游协议', '认证方式', '优先级分组', '图标']) {
    expect(more).toHaveTextContent(label)
  }
  expect(more).toHaveTextContent('yls-me')
  for (const label of ['模型白名单', '模型映射', '可用性监控']) expect(adv).toHaveTextContent(label)
  expect(adv).toHaveTextContent('claude-*')
})

test('adding a whitelist entry saves the whole whitelist', async () => {
  const setConfig = mock((..._args: unknown[]) => undefined)
  renderPanel({ setConfig })
  await screen.findByDisplayValue('sk-real')
  fireEvent.change(screen.getByPlaceholderText('输入模型名称，如 claude-*'), { target: { value: 'gpt-4o' } })
  fireEvent.click(screen.getByRole('button', { name: '添加' }))
  await waitFor(() => expect(setConfig).toHaveBeenCalled(), { timeout: 1500 })
  const [, values] = setConfig.mock.calls[setConfig.mock.calls.length - 1] as [string, Record<string, unknown>]
  expect(values.whitelist).toEqual(['claude-*', 'gpt-4o'])
})

test('toggling 可用性监控 saves healthCheck flipped', async () => {
  const setConfig = mock((..._args: unknown[]) => undefined)
  renderPanel({ setConfig })
  await screen.findByDisplayValue('sk-real')
  fireEvent.click(screen.getByRole('switch', { name: '可用性监控' }))
  await waitFor(() => expect(setConfig).toHaveBeenCalled(), { timeout: 1500 })
  const [, values] = setConfig.mock.calls[setConfig.mock.calls.length - 1] as [string, Record<string, unknown>]
  expect(values.healthCheck).toBe(false)
})

test('rapid edits are saved once, after the 500ms debounce, with 自动保存中… then 已自动保存', async () => {
  const setConfig = mock((..._args: unknown[]) => undefined)
  renderPanel({ setConfig })
  const input = await screen.findByDisplayValue('sk-real')
  fireEvent.change(input, { target: { value: 'sk-a' } })
  fireEvent.change(input, { target: { value: 'sk-abc' } })
  expect(setConfig).not.toHaveBeenCalled()
  expect(await screen.findByText('自动保存中…')).toBeInTheDocument()
  await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(1), { timeout: 1500 })
  expect((setConfig.mock.calls[0] as [string, Record<string, unknown>])[1].apiKey).toBe('sk-abc')
  expect(await screen.findByText('已自动保存')).toBeInTheDocument()
})

test('local: the fixed address agents are pointed at, and no key', async () => {
  renderLocal()
  expect(await screen.findByText('127.0.0.1:18780')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('http://127.0.0.1:18100')).not.toBeInTheDocument()
  expect(screen.queryByText('测试连接', { selector: 'button' })).not.toBeInTheDocument()
  expect(screen.queryByText('API 密钥')).not.toBeInTheDocument()
  expect(screen.queryByText('更多设置')).not.toBeInTheDocument()
  expect(screen.queryByText('尚未填写 API 密钥，这份配置已保存但暂时无法使用。')).not.toBeInTheDocument()
  expect(screen.getByText('Claude Code 的 API 地址指向本地中转')).toBeInTheDocument()
})

test('local: still warns when no agent is routed through it', async () => {
  renderLocal()
  await screen.findByText('127.0.0.1:18780')
  fireEvent.click(claude())
  expect(await screen.findByText('尚未对任何 agent 启用，这份配置已保存但不会生效。')).toBeInTheDocument()
})

test('a refused enable shows the reason and leaves the switch off', async () => {
  const enable = mock(async () => { throw new Error('yls-me has no API key configured; run: aas config yls-me') })
  renderPanel({ enable })
  await screen.findByDisplayValue('sk-real')
  fireEvent.click(claude())
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('启用 Claude Code 失败')
  expect(alert.textContent).toContain('no API key configured')
  expect(claude()).not.toBeChecked()
})

test('a failed save is shown instead of 已自动保存', async () => {
  renderPanel({ setConfig: async () => { throw new Error('disk full') } })
  const input = await screen.findByDisplayValue('sk-real')
  fireEvent.change(input, { target: { value: 'sk-new' } })
  const alert = await screen.findByRole('alert', {}, { timeout: 2000 })
  expect(alert.textContent).toContain('保存失败')
  expect(alert.textContent).toContain('disk full')
  expect(screen.queryByText('已自动保存')).toBeNull()
})

test('a missing key is explained in the app, focuses the key field and keeps the engine text as detail', async () => {
  const raw = 'yls-me has no API key configured; run: aas config yls-me'
  renderPanel({ enable: async () => { throw new rpcModule.RpcError(raw, 'ProviderNotReadyError', { reason: 'no-key' }) } })
  const key = await screen.findByDisplayValue('sk-real')
  fireEvent.click(claude())
  const alert = await screen.findByRole('alert')
  const lead = alert.textContent!.split('详细信息')[0]
  expect(lead).toContain('启用 Claude Code 失败')
  expect(lead).toContain('请先填写 API 密钥')
  expect(lead).not.toContain('aas config')
  expect(alert.querySelector('details code')?.textContent).toBe(raw)
  await waitFor(() => expect(document.activeElement === key).toBe(true))
})

test('a relay that could not start is explained without the CLI command', async () => {
  renderPanel({
    enable: async () => {
      throw new rpcModule.RpcError('the local relay is not running and could not be started; start it with: aas relay start', 'ProviderNotReadyError', { reason: 'relay-not-running' })
    },
  })
  await screen.findByDisplayValue('sk-real')
  fireEvent.click(claude())
  const lead = (await screen.findByRole('alert')).textContent!.split('详细信息')[0]
  expect(lead).toContain('本地中转服务没有启动起来')
  expect(lead).not.toContain('aas relay start')
})

test('再添加一份配置 duplicates the provider', async () => {
  const duplicateProvider = mock(() => ({ newSlug: 'yls-me-copy' }))
  renderPanel({ duplicateProvider })
  await screen.findByDisplayValue('sk-real')
  fireEvent.click(screen.getByRole('button', { name: /再添加一份配置/ }))
  await waitFor(() => expect(duplicateProvider).toHaveBeenCalledWith('yls-me'))
})

test('测试连接 shows each agent with its outcome, latency and the upstream reason', async () => {
  const testProvider = mock(() => [
    { target: 'claude', url: 'https://code.ylsagi.com/codex/v1/messages', outcome: 'ok', ok: true, statusCode: 400, latencyMs: 210 },
    { target: 'codex', url: 'https://code.ylsagi.com/codex/responses', outcome: 'key-rejected', ok: false, statusCode: 401, latencyMs: 95, message: 'Incorrect API key provided: ***' },
  ])
  renderPanel({ testProvider })
  await screen.findByDisplayValue('sk-real')

  fireEvent.click(screen.getByRole('button', { name: '测试连接' }))

  expect(await screen.findByText('可用：地址能连上，密钥没有被拒绝')).toBeInTheDocument()
  expect(testProvider).toHaveBeenCalledWith('yls-me')
  expect(screen.getByText('HTTP 400 · 210 ms')).toBeInTheDocument()
  expect(screen.getByText('密钥被拒绝')).toBeInTheDocument()
  expect(screen.getByText('Incorrect API key provided: ***')).toBeInTheDocument()
  expect(screen.getByText('POST https://code.ylsagi.com/codex/responses')).toBeInTheDocument()
})

test('测试连接 waits for a key', async () => {
  renderPanel()
  const key = await screen.findByDisplayValue('sk-real')
  fireEvent.change(key, { target: { value: '' } })
  expect(await screen.findByText('先填写 API 密钥')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '测试连接' })).toBeDisabled()
})

test('a test that cannot run shows why', async () => {
  renderPanel({ testProvider: async () => { throw new Error('Item not installed: yls-me') } })
  await screen.findByDisplayValue('sk-real')
  fireEvent.click(screen.getByRole('button', { name: '测试连接' }))
  expect(await screen.findByText('Item not installed: yls-me')).toBeInTheDocument()
})
