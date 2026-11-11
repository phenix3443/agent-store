import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'

const openMock = mock(async () => {})
mock.module('../../lib/openExternal', () => ({ openExternal: openMock }))
let deepLinkHandler: ((url: string) => void) | null = null
mock.module('../../lib/deepLink', () => ({
  onDeepLink: async (handler: (url: string) => void) => {
    deepLinkHandler = handler
    return () => {}
  },
  getLaunchDeepLinks: async () => [],
}))
// Pin the store base + email decode so the relay URL and session are deterministic.
mock.module('../../lib/storeAuth', () => ({
  getStoreBaseUrl: () => 'https://store.test',
  getAuthScheme: () => 'agent-store',
  emailFromJwt: () => 'dev@example.com',
  AUTH_REDIRECT_URL: 'agent-store://auth-callback',
}))

const { AuthProvider, useAuth } = await import('../Auth')
const { EntitlementProvider } = await import('../Entitlement')

let syncedToken: string | null = null

afterEach(() => {
  cleanup()
  mock.restore()
  openMock.mockClear()
  syncedToken = null
  deepLinkHandler = null
})

function Probe() {
  const { signIn, completeSignIn, configured, signedIn, email } = useAuth()
  return (
    <div>
      <span data-testid="configured">{String(configured)}</span>
      <span data-testid="signedin">{String(signedIn)}</span>
      <span data-testid="email">{email ?? ''}</span>
      <button type="button" onClick={() => void signIn('github')}>signin</button>
      <button type="button" onClick={() => void completeSignIn('agent-store://auth-callback?token=tok123')}>complete</button>
    </div>
  )
}

function renderProbe() {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, params?: unknown[]) => {
    if (method === 'getEntitlements') return { plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }
    if (method === 'syncEntitlement') {
      syncedToken = (params?.[0] as string) ?? null
      return { plan: 'pro', advancedUsageAnalytics: true, smartRouting: true, keyRotation: true }
    }
    if (method === 'clearEntitlement') return { plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }
    throw new Error(`unexpected RPC in Auth test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(
    <EntitlementProvider>
      <AuthProvider><Probe /></AuthProvider>
    </EntitlementProvider>
  )
}

test('sign-in is always configured (auth goes through the web store relay)', async () => {
  renderProbe()
  expect(await screen.findByTestId('configured')).toHaveTextContent('true')
})

test('signIn opens the store relay page for the provider in the browser', async () => {
  renderProbe()
  fireEvent.click(screen.getByText('signin'))
  await waitFor(() => expect(openMock).toHaveBeenCalledWith('https://store.test/auth/desktop?provider=github&scheme=agent-store'))
})

test('completeSignIn stores the deep-linked token and syncs entitlements', async () => {
  renderProbe()
  fireEvent.click(screen.getByText('complete'))
  await waitFor(() => expect(screen.getByTestId('signedin')).toHaveTextContent('true'))
  expect(screen.getByTestId('email')).toHaveTextContent('dev@example.com')
  expect(syncedToken).toBe('tok123')
})

test('a deep-linked auth callback signs in', async () => {
  renderProbe()
  await waitFor(() => expect(deepLinkHandler).not.toBeNull())
  act(() => deepLinkHandler!('agent-store://auth-callback?token=tok456'))
  await waitFor(() => expect(screen.getByTestId('signedin')).toHaveTextContent('true'))
  expect(syncedToken).toBe('tok456')
})

test('an install link never signs in, even when it carries a token', async () => {
  renderProbe()
  await waitFor(() => expect(deepLinkHandler).not.toBeNull())
  act(() => deepLinkHandler!('agent-store://install?slug=filesystem&token=tok789'))
  await new Promise((r) => setTimeout(r, 20))
  expect(screen.getByTestId('signedin')).toHaveTextContent('false')
  expect(syncedToken).toBeNull()
})
