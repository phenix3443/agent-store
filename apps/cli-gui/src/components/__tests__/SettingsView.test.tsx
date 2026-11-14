import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'

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

afterEach(() => {
  cleanup()
  mock.restore()
  openMock.mockClear()
})

function AccountTab() {
  const { setSettingsTab } = useAppState()
  return <button onClick={() => setSettingsTab('account')}>open-account</button>
}

function renderView() {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'getEntitlements') return { plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }
    if (method === 'createCheckout') return { checkoutUrl: 'https://pay.example/cs_1' }
    if (method === 'checkUpdates') return [{ slug: 'a' }]
    throw new Error(`unexpected RPC in SettingsView test: ${method}`)
  }) as typeof rpcModule.callRpc)

  return render(
    <AppStateProvider>
      <EntitlementProvider>
        <AuthProvider>
          <AccountTab />
          <SettingsView />
        </AuthProvider>
      </EntitlementProvider>
    </AppStateProvider>
  )
}

test('opens on the general tab: dark-only theme, default app and language', () => {
  renderView()
  expect(screen.getByRole('tab', { name: '通用' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('当前只提供深色主题。')).toBeInTheDocument()
  expect(screen.getByText('默认目标应用')).toBeInTheDocument()
  expect(screen.getByText('界面语言')).toBeInTheDocument()
})

test('the language menu offers only Chinese and English', async () => {
  renderView()
  fireEvent.keyDown(screen.getByRole('button', { name: '中文' }), { key: 'Enter' })
  expect(await screen.findByRole('menuitemradio', { name: 'English' })).toBeInTheDocument()
  expect(screen.getAllByRole('menuitemradio')).toHaveLength(2)
})

test('the account tab shows the signed-out state and a free-plan upgrade', async () => {
  renderView()
  fireEvent.click(screen.getByText('open-account'))
  expect(await screen.findByText('未登录')).toBeInTheDocument()
  expect(screen.getByText('使用 GitHub 登录')).toBeInTheDocument()
  expect(screen.getByText('使用 Google 登录')).toBeInTheDocument()
  expect(screen.getByText('升级 Pro')).toBeInTheDocument()
  expect(screen.queryByText(/跨设备同步/)).toBeNull()
})

for (const provider of ['GitHub', 'Google']) {
  test(`使用 ${provider} 登录 opens the store relay page`, async () => {
    renderView()
    fireEvent.click(screen.getByText('open-account'))
    fireEvent.click(await screen.findByText(`使用 ${provider} 登录`))
    await waitFor(() =>
      expect(openMock).toHaveBeenCalledWith(`https://store.test/auth/desktop?provider=${provider.toLowerCase()}&scheme=agent-store`)
    )
  })
}

test('升级 Pro creates a checkout session and opens it', async () => {
  renderView()
  fireEvent.click(screen.getByText('open-account'))
  fireEvent.click(await screen.findByText('升级 Pro'))
  await waitFor(() => expect(openMock).toHaveBeenCalledWith('https://pay.example/cs_1'))
})

test('the about tab shows the version and checks installed items for updates', async () => {
  renderView()
  fireEvent.click(screen.getByRole('tab', { name: '关于' }))
  expect(screen.getByText('Agent Store')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '文档' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '检查更新' }))
  expect(await screen.findByText('1 个可更新')).toBeInTheDocument()
})
