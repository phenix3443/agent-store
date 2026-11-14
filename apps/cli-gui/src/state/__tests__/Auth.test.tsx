import { test, expect, afterEach, beforeEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'

const openMock = mock(async (_url: string) => {})
mock.module('../../lib/openExternal', () => ({ openExternal: openMock }))
mock.module('../../lib/focusWindow', () => ({ focusMainWindow: async () => {} }))
mock.module('../../lib/storeAuth', () => ({
  getStoreBaseUrl: () => 'https://store.test',
  emailFromJwt: (t: string) => (t.startsWith('jwt') ? 'dev@example.com' : null),
  userIdFromJwt: (t: string) => (t.startsWith('jwt') ? 'u1' : null),
}))

// The OS credential store, in memory. `available = false` is a Linux box without Secret Service.
const vault = new Map<string, string>()
let available = true
mock.module('../../lib/credentials', () => ({
  readCredential: async (account: string) =>
    !available ? { status: 'unavailable', detail: 'no secret service' } : vault.has(account) ? { status: 'found', secret: vault.get(account) } : { status: 'missing' },
  writeCredential: async (account: string, secret: string) => {
    if (!available) return { status: 'unavailable', detail: 'no secret service' }
    vault.set(account, secret)
    return { status: 'done' }
  },
  deleteCredential: async (account: string) => {
    vault.delete(account)
    return { status: 'done' }
  },
}))

const { AuthProvider, useAuth, approvalUrl } = await import('../Auth')
const { EntitlementProvider } = await import('../Entitlement')
const { RpcError } = rpcModule

const FREE = { plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }
const PRO = { plan: 'pro', advancedUsageAnalytics: true, smartRouting: true, keyRotation: true }
const soon = () => Math.floor(Date.now() / 1000) + 900

type Handler = (args: unknown[]) => unknown
let calls: Array<[string, unknown[]]> = []

function mockRpc(handlers: Record<string, Handler>) {
  calls = []
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push([method, args])
    if (handlers[method]) return handlers[method](args)
    if (method === 'getEntitlements' || method === 'clearEntitlement') return FREE
    if (method === 'syncEntitlement') return PRO
    throw new Error(`unexpected RPC in Auth test: ${method}`)
  }) as typeof rpcModule.callRpc)
}

const called = (method: string) => calls.filter(([m]) => m === method)

function Probe() {
  const a = useAuth()
  return (
    <div>
      <span data-testid="state">{`${a.restoring ? 'restoring' : a.signedIn ? 'in' : 'out'}|${a.email ?? ''}|${a.notice ?? ''}|${a.persisted}`}</span>
      <span data-testid="pending">{a.pending ? `${a.pending.state}|${a.pending.userCode ?? ''}` : 'none'}</span>
      <button type="button" onClick={() => void a.signIn('github')}>signin</button>
      <button type="button" onClick={a.cancelSignIn}>cancel</button>
      <button type="button" onClick={() => void a.signOut()}>signout</button>
    </div>
  )
}

function renderProbe() {
  render(
    <EntitlementProvider>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </EntitlementProvider>
  )
}

const state = () => screen.getByTestId('state').textContent
const pending = () => screen.getByTestId('pending').textContent

const device = { deviceCode: 'dev-1', userCode: 'ABCDEFGH', verificationUriComplete: 'https://store.test/auth/device?user_code=ABCDEFGH', expiresIn: 600, interval: 0 }

beforeEach(() => {
  vault.clear()
  available = true
})

afterEach(() => {
  cleanup()
  mock.restore()
  openMock.mockClear()
})

test('approvalUrl adds the provider and refuses anything but http(s)', () => {
  expect(approvalUrl('https://store.test/auth/device?user_code=AB', 'google')).toBe('https://store.test/auth/device?user_code=AB&provider=google')
  expect(approvalUrl('javascript:alert(1)', 'github')).toBeNull()
  expect(approvalUrl('not a url', 'github')).toBeNull()
})

test('a stored session signs in at start and refreshes the plan', async () => {
  vault.set('store-session', 'sess-1')
  mockRpc({ getAccessToken: () => ({ token: 'jwt-1', expiresAt: soon() }) })
  renderProbe()
  await waitFor(() => expect(state()).toBe('in|dev@example.com||true'))
  expect(called('getAccessToken')[0]?.[1]).toEqual(['sess-1'])
  await waitFor(() => expect(called('syncEntitlement')[0]?.[1]).toEqual(['jwt-1']))
})

test('a stored session the server rejects signs out, says why, and is deleted', async () => {
  vault.set('store-session', 'sess-gone')
  mockRpc({
    getAccessToken: () => {
      throw new RpcError('The sign-in has expired or was revoked', 'SessionExpiredError')
    },
  })
  renderProbe()
  await waitFor(() => expect(state()).toBe('out||expired|true'))
  expect(vault.has('store-session')).toBe(false)
  expect(called('clearEntitlement').length).toBeGreaterThan(0)
})

test('offline at start keeps the session and stays signed in', async () => {
  vault.set('store-session', 'sess-1')
  mockRpc({
    getAccessToken: () => {
      throw new RpcError('fetch failed', 'StoreUnavailableError')
    },
  })
  renderProbe()
  await waitFor(() => expect(state()).toBe('in|||true'))
  expect(vault.get('store-session')).toBe('sess-1')
})

test('sign-in shows the code, opens the approval page, polls until approved and stores the session', async () => {
  let polls = 0
  mockRpc({
    startSignIn: () => device,
    pollSignIn: () => (++polls < 3 ? { status: 'pending' } : { status: 'approved', sessionToken: 'sess-new', expiresIn: 604800 }),
    getAccessToken: () => ({ token: 'jwt-new', expiresAt: soon() }),
  })
  renderProbe()
  await waitFor(() => expect(state()).toBe('out|||true'))
  fireEvent.click(screen.getByText('signin'))
  await waitFor(() => expect(openMock).toHaveBeenCalledWith('https://store.test/auth/device?user_code=ABCDEFGH&provider=github'))
  await waitFor(() => expect(state()).toBe('in|dev@example.com||true'))
  expect(pending()).toBe('none')
  expect(vault.get('store-session')).toBe('sess-new')
  expect(called('pollSignIn').every(([, a]) => a[0] === 'dev-1')).toBe(true)
})

test('without a credential store the sign-in works for this run only, and says so', async () => {
  available = false
  mockRpc({
    startSignIn: () => device,
    pollSignIn: () => ({ status: 'approved', sessionToken: 'sess-new', expiresIn: 604800 }),
    getAccessToken: () => ({ token: 'jwt-new', expiresAt: soon() }),
  })
  renderProbe()
  await waitFor(() => expect(state()).toBe('out|||true'))
  fireEvent.click(screen.getByText('signin'))
  await waitFor(() => expect(state()).toBe('in|dev@example.com|notSaved|false'))
  expect(vault.size).toBe(0)
})

test('denied and expired codes stop the sign-in with their reason', async () => {
  mockRpc({ startSignIn: () => device, pollSignIn: () => ({ status: 'denied' }) })
  renderProbe()
  fireEvent.click(await screen.findByText('signin'))
  await waitFor(() => expect(pending()).toBe('denied|ABCDEFGH'))
  cleanup()

  mockRpc({ startSignIn: () => device, pollSignIn: () => ({ status: 'expired' }) })
  renderProbe()
  fireEvent.click(await screen.findByText('signin'))
  await waitFor(() => expect(pending()).toBe('timedOut|ABCDEFGH'))
  expect(state()).toBe('out|||true')
})

test('a store that cannot start a sign-in shows it as failed', async () => {
  mockRpc({
    startSignIn: () => {
      throw new RpcError('Not Found', 'StoreUnavailableError')
    },
  })
  renderProbe()
  fireEvent.click(await screen.findByText('signin'))
  await waitFor(() => expect(pending()).toBe('failed|'))
  expect(openMock).not.toHaveBeenCalled()
})

test('cancel stops polling', async () => {
  mockRpc({ startSignIn: () => ({ ...device, interval: 0.05 }), pollSignIn: () => ({ status: 'pending' }) })
  renderProbe()
  fireEvent.click(await screen.findByText('signin'))
  await waitFor(() => expect(called('pollSignIn').length).toBeGreaterThan(0))
  fireEvent.click(screen.getByText('cancel'))
  expect(pending()).toBe('none')
  const n = called('pollSignIn').length
  await new Promise((r) => setTimeout(r, 200))
  expect(called('pollSignIn').length).toBeLessThanOrEqual(n + 1)
})

test('sign-out ends the session on the server and deletes the credential', async () => {
  vault.set('store-session', 'sess-1')
  mockRpc({ getAccessToken: () => ({ token: 'jwt-1', expiresAt: soon() }), signOutSession: () => null })
  renderProbe()
  await waitFor(() => expect(state()).toBe('in|dev@example.com||true'))
  fireEvent.click(screen.getByText('signout'))
  await waitFor(() => expect(called('signOutSession')[0]?.[1]).toEqual(['sess-1']))
  expect(state()).toBe('out|||true')
  expect(vault.size).toBe(0)
})

test('signed out offline, the session is revoked on the next start', async () => {
  vault.set('store-session', 'sess-1')
  mockRpc({
    getAccessToken: () => ({ token: 'jwt-1', expiresAt: soon() }),
    signOutSession: () => {
      throw new RpcError('fetch failed', 'StoreUnavailableError')
    },
  })
  renderProbe()
  await waitFor(() => expect(state()).toBe('in|dev@example.com||true'))
  fireEvent.click(screen.getByText('signout'))
  await waitFor(() => expect(vault.get('store-session-revoke')).toBe('sess-1'))
  expect(vault.has('store-session')).toBe(false)
  cleanup()

  mockRpc({ signOutSession: () => null })
  renderProbe()
  await waitFor(() => expect(called('signOutSession')[0]?.[1]).toEqual(['sess-1']))
  await waitFor(() => expect(vault.has('store-session-revoke')).toBe(false))
  expect(state()).toBe('out|||true')
})
