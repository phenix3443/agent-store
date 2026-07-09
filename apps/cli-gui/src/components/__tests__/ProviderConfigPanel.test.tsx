import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ProviderConfigPanel } from '../ProviderConfigPanel'
import * as rpcModule from '../../lib/rpc'
import { EntitlementProvider } from '../../state/Entitlement'

afterEach(() => { cleanup(); mock.restore() })

const publisher = { id: 'p', slug: 'yls', name: 'yls', avatarUrl: '', tier: 'community' as const }

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) =>
    handlers[method]?.(...args)) as typeof rpcModule.callRpc)
}

function renderPanel(handlers?: Record<string, (...args: unknown[]) => unknown>) {
  mockRpc({
    info: () => ({
      slug: 'yls-me', category: 'provider', version: '0.9.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude', 'codex'], enabledFor: { claude: false, codex: true },
      name: 'yls-me', description: 'desc', publisher, tags: [], downloads: 0,
      currentConfig: {
        name: '我的配置', apiKey: 'sk-real', baseUrl: 'https://code.ylsagi.com/codex', authType: 'bearer',
        level: 2, whitelist: ['claude-*'], healthCheck: true,
      },
    }),
    setConfig: () => undefined,
    enable: () => undefined,
    disable: () => undefined,
    getEntitlements: () => ({ plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }),
    ...handlers,
  })
  return render(
    <EntitlementProvider>
      <ProviderConfigPanel slug="yls-me" onClose={() => {}} />
    </EntitlementProvider>
  )
}

test('renders the config-name input and the required fields grid with current values', async () => {
  renderPanel()
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  expect(screen.getByDisplayValue('我的配置')).toHaveAttribute('id', 'cli-config-name')
  expect(screen.getByText('API 密钥')).toBeInTheDocument()
  expect(screen.getByText('适用客户端')).toBeInTheDocument()
})

test('empty config name shows the inline error', async () => {
  renderPanel()
  const nameInput = await waitFor(() => screen.getByDisplayValue('我的配置'))
  fireEvent.change(nameInput, { target: { value: '' } })
  expect(await screen.findByText('请先填写配置名称')).toBeInTheDocument()
})

test('targets picker reflects enabledFor and toggling calls enable/disable', async () => {
  const enable = mock(() => undefined)
  renderPanel({ enable })
  await waitFor(() => screen.getByLabelText('Claude Code'))
  fireEvent.click(screen.getByLabelText('Claude Code'))
  await waitFor(() => expect(enable).toHaveBeenCalledWith('yls-me', 'claude'))
})

test('missing targets shows the non-blocking amber warning banner', async () => {
  const disable = mock(() => undefined)
  renderPanel({ disable })
  await waitFor(() => screen.getByLabelText('Codex'))
  fireEvent.click(screen.getByLabelText('Codex'))
  expect(await screen.findByText('尚未选择适用客户端，此配置已保存但不会对任何 CLI 生效')).toBeInTheDocument()
})

test('missing apiKey shows the non-blocking amber warning banner', async () => {
  renderPanel()
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.change(screen.getByLabelText(/API 密钥/), { target: { value: '' } })
  expect(await screen.findByText('尚未填写 API 密钥，此配置已保存但暂时无法使用')).toBeInTheDocument()
})

test('更多设置 is collapsed by default and expands to show baseUrl/homepage/endpoint/upstreamProtocol/level/icon/readonly provider name', async () => {
  renderPanel()
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  expect(screen.queryByText('API 地址')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('更多设置'))
  expect(screen.getByText('API 地址')).toBeInTheDocument()
  expect(screen.getByText('官网地址')).toBeInTheDocument()
  expect(screen.getByText('API 端点')).toBeInTheDocument()
  expect(screen.getByText('上游协议')).toBeInTheDocument()
  expect(screen.getByText('优先级分组')).toBeInTheDocument()
  expect(screen.getByText('图标')).toBeInTheDocument()
  expect(screen.getByText('供应商名称')).toBeInTheDocument()
  expect(screen.getByText('（不可修改）')).toBeInTheDocument()
  expect(screen.getByText('yls-me')).toBeInTheDocument()
})

test('更多设置 no longer contains the invented pricing UI', async () => {
  renderPanel()
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.click(screen.getByText('更多设置'))
  expect(screen.queryByText('定价页面链接')).not.toBeInTheDocument()
  expect(screen.queryByText('解析定价')).not.toBeInTheDocument()
})

test('高级设置 is collapsed by default and expands to show whitelist/mapping/healthCheck', async () => {
  renderPanel()
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  expect(screen.queryByText('模型白名单')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('高级设置'))
  expect(screen.getByText('模型白名单')).toBeInTheDocument()
  expect(screen.getByText('模型映射')).toBeInTheDocument()
  expect(screen.getByText('可用性监控')).toBeInTheDocument()
  expect(screen.getByText('claude-*')).toBeInTheDocument()
})

test('adding a whitelist entry calls setConfig with the updated whitelist array', async () => {
  const setConfig = mock((..._args: unknown[]) => undefined)
  renderPanel({ setConfig })
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.click(screen.getByText('高级设置'))
  fireEvent.change(screen.getByPlaceholderText('输入模型名称，如 claude-*'), { target: { value: 'gpt-4o' } })
  fireEvent.click(screen.getByText('添加'))
  await waitFor(() => expect(setConfig).toHaveBeenCalled(), { timeout: 1500 })
  const [, values] = setConfig.mock.calls[setConfig.mock.calls.length - 1] as [string, Record<string, unknown>]
  expect(values.whitelist).toEqual(['claude-*', 'gpt-4o'])
})

test('toggling 可用性监控 calls setConfig with healthCheck flipped', async () => {
  const setConfig = mock((..._args: unknown[]) => undefined)
  renderPanel({ setConfig })
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.click(screen.getByText('高级设置'))
  fireEvent.click(screen.getByLabelText('可用性监控'))
  await waitFor(() => expect(setConfig).toHaveBeenCalled(), { timeout: 1500 })
  const [, values] = setConfig.mock.calls[setConfig.mock.calls.length - 1] as [string, Record<string, unknown>]
  expect(values.healthCheck).toBe(false)
})

test('editing apiKey does not call setConfig immediately but does after the 500ms debounce', async () => {
  const setConfig = mock((..._args: unknown[]) => undefined)
  renderPanel({ setConfig })
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.change(screen.getByLabelText(/API 密钥/), { target: { value: 'sk-new' } })
  expect(setConfig).not.toHaveBeenCalled()
  await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(1), { timeout: 1500 })
})

test('rapid successive edits within the debounce window only trigger one setConfig call', async () => {
  const setConfig = mock((..._args: unknown[]) => undefined)
  renderPanel({ setConfig })
  const input = await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.change(input, { target: { value: 'sk-a' } })
  fireEvent.change(input, { target: { value: 'sk-ab' } })
  fireEvent.change(input, { target: { value: 'sk-abc' } })
  await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(1), { timeout: 1500 })
  const [, values] = setConfig.mock.calls[0] as [string, Record<string, unknown>]
  expect(values.apiKey).toBe('sk-abc')
})

test('shows 自动保存中… while debouncing and 已自动保存 once the save resolves', async () => {
  renderPanel()
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.change(screen.getByLabelText(/API 密钥/), { target: { value: 'sk-valid' } })
  expect(await screen.findByText('自动保存中…')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('已自动保存')).toBeInTheDocument(), { timeout: 1500 })
})

test('hovering a help icon shows the field help text', async () => {
  renderPanel()
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.click(screen.getByText('更多设置'))
  const baseUrlLabel = screen.getByText('API 地址')
  const helpIcon = baseUrlLabel.parentElement?.querySelector('[class*="cursor-help"]')
  expect(helpIcon).toBeTruthy()
  if (helpIcon) fireEvent.mouseEnter(helpIcon)
  expect(await screen.findByText(/上游供应商的真实地址/)).toBeInTheDocument()
})

function renderLocalPanel(handlers?: Record<string, (...args: unknown[]) => unknown>) {
  mockRpc({
    info: () => ({
      slug: 'local', category: 'provider', version: '1.0.0', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude', 'codex'], enabledFor: { claude: true },
      name: 'local', description: '内置本地代理',
      publisher: { ...publisher, tier: 'official' as const }, tags: [], downloads: 0,
    }),
    setConfig: () => undefined,
    enable: () => undefined,
    disable: () => undefined,
    getEntitlements: () => ({ plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }),
    ...handlers,
  })
  return render(
    <EntitlementProvider>
      <ProviderConfigPanel slug="local" onClose={() => {}} />
    </EntitlementProvider>
  )
}

test('local: shows an essential API 地址 field defaulting to 127.0.0.1:18100 and no API 密钥 field', async () => {
  renderLocalPanel()
  await waitFor(() => expect(screen.getByDisplayValue('http://127.0.0.1:18100')).toBeInTheDocument())
  expect(screen.queryByText('API 密钥')).not.toBeInTheDocument()
  // baseUrl is essential, so it is visible before expanding 更多设置
  expect(screen.getByText('API 地址')).toBeInTheDocument()
})

test('local: default config name is 默认', async () => {
  renderLocalPanel()
  await waitFor(() => expect(screen.getByDisplayValue('默认')).toHaveAttribute('id', 'cli-config-name'))
})

test('local: does not show the missing-API-key amber warning', async () => {
  renderLocalPanel()
  await waitFor(() => screen.getByDisplayValue('http://127.0.0.1:18100'))
  expect(screen.queryByText('尚未填写 API 密钥，此配置已保存但暂时无法使用')).not.toBeInTheDocument()
})

test('local: still warns when no targets are selected', async () => {
  const disable = mock(() => undefined)
  renderLocalPanel({ disable })
  await waitFor(() => screen.getByLabelText('Claude Code'))
  fireEvent.click(screen.getByLabelText('Claude Code'))
  expect(await screen.findByText('尚未选择适用客户端，此配置已保存但不会对任何 CLI 生效')).toBeInTheDocument()
})

test('local: does not duplicate the baseUrl field inside 更多设置', async () => {
  renderLocalPanel()
  await waitFor(() => screen.getByDisplayValue('http://127.0.0.1:18100'))
  fireEvent.click(screen.getByText('更多设置'))
  // Only the essential API 地址 field remains; the optional one is suppressed for local.
  expect(screen.getAllByText('API 地址')).toHaveLength(1)
})
