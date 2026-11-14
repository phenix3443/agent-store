import { test, expect, afterEach, beforeEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { ResourceSummary } from '@as/types'
import * as rpcModule from '../../lib/rpc'
import * as credentials from '../../lib/credentials'
import * as persistence from '../LocalPersistence'
import { AuthProvider } from '../Auth'
import { EntitlementProvider } from '../Entitlement'
import { FavoritesProvider, useFavorites, applyPending, mergeLocalIntoPending, keepUnsentLocally, EMPTY, type StoredFavorites } from '../Favorites'

const { RpcError } = rpcModule

const summary = (id: string, name: string): ResourceSummary => ({
  id,
  kind: id.startsWith('github:') ? 'skill' : 'mcp',
  name,
  description: null,
  author: null,
  version: null,
  homepageUrl: null,
  installs: null,
  stars: null,
  verified: false,
  tags: [],
  transports: [],
  origin: { site: 'github', upstreamId: id, url: null, upstreamVersion: null, upstreamUpdatedAt: null, syncedAt: '', unavailableAt: null, unavailableReason: null },
})
const A = summary('github:a/b/one', 'one')
const B = summary('github:a/b/two', 'two')
const C = summary('mcp-registry:io.x/three', 'three')
const soon = () => Math.floor(Date.now() / 1000) + 900
// Starts with `jwt` for the storeAuth stand-in other test files install; decodes to sub u1 for the real one.
const JWT = `jwt.${btoa(JSON.stringify({ sub: 'u1', email: 'dev@example.com' })).replace(/=+$/, '')}.sig`

let disk: StoredFavorites | null = null
let session: string | null = null
let server: string[] = []
let calls: Array<[string, unknown[]]> = []

function setup(handlers: Record<string, (args: unknown[]) => unknown> = {}) {
  calls = []
  spyOn(persistence, 'readLocalState').mockImplementation((async (_key: string, fallback: unknown) => disk ?? fallback) as typeof persistence.readLocalState)
  spyOn(persistence, 'writeLocalState').mockImplementation((async (_key: string, value: unknown) => {
    disk = JSON.parse(JSON.stringify(value)) as StoredFavorites
  }) as typeof persistence.writeLocalState)
  spyOn(credentials, 'readCredential').mockImplementation(async () => (session ? { status: 'found', secret: session } : { status: 'missing' }))
  spyOn(credentials, 'writeCredential').mockImplementation(async () => ({ status: 'done' }))
  spyOn(credentials, 'deleteCredential').mockImplementation(async () => ({ status: 'done' }))
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push([method, args])
    if (handlers[method]) return handlers[method](args)
    switch (method) {
      case 'getEntitlements':
      case 'clearEntitlement':
      case 'syncEntitlement':
        return { plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }
      case 'getAccessToken':
        return { token: JWT, expiresAt: soon() }
      case 'listFavorites':
        return server.map((id) => ({ id, createdAt: '', resource: [A, B, C].find((r) => r.id === id) ?? null }))
      case 'setFavorite': {
        const [, id, on] = args as [string, string, boolean]
        server = on ? [id, ...server.filter((s) => s !== id)] : server.filter((s) => s !== id)
        return null
      }
      case 'signOutSession':
        return null
    }
    throw new Error(`unexpected RPC in Favorites test: ${method}`)
  }) as typeof rpcModule.callRpc)
}

function Probe() {
  const f = useFavorites()
  return (
    <div>
      <span data-testid="ids">{f.items.map((i) => i.resource?.name ?? i.id).join(',')}</span>
      <span data-testid="sync">{`${f.unsynced}|${f.syncError}|${f.refusedFull ?? ''}`}</span>
      <button type="button" onClick={() => f.toggle(A.id, A)}>a</button>
      <button type="button" onClick={() => f.toggle(C.id, C)}>c</button>
      <button type="button" onClick={f.retry}>retry</button>
    </div>
  )
}

function renderProbe() {
  render(
    <EntitlementProvider>
      <AuthProvider>
        <FavoritesProvider>
          <Probe />
        </FavoritesProvider>
      </AuthProvider>
    </EntitlementProvider>
  )
}

const ids = () => screen.getByTestId('ids').textContent
const sync = () => screen.getByTestId('sync').textContent

beforeEach(() => {
  disk = null
  session = null
  server = []
})
afterEach(() => {
  cleanup()
  mock.restore()
})

test('applyPending puts additions first and drops removals', () => {
  const items = [{ id: B.id, resource: B }, { id: C.id, resource: C }]
  expect(applyPending(items, [{ id: A.id, on: true, resource: A }, { id: C.id, on: false, resource: null }]).map((i) => i.id)).toEqual([A.id, B.id])
})

test('first sign-in queues the local favorites as additions, oldest first', () => {
  const state = { ...EMPTY, local: [{ id: A.id, resource: A }, { id: B.id, resource: B }] }
  expect(mergeLocalIntoPending(state).pending.map((p) => p.id)).toEqual([B.id, A.id])
  expect(mergeLocalIntoPending(state).local).toEqual([])
})

test('sign-out keeps unsent additions on this machine and forgets the account list', () => {
  const state: StoredFavorites = {
    ...EMPTY,
    pending: [{ id: A.id, on: true, resource: A }, { id: B.id, on: false, resource: null }],
    account: { userId: 'u1', items: [{ id: C.id, resource: C }] },
  }
  expect(keepUnsentLocally(state)).toEqual({ version: 1, local: [{ id: A.id, resource: A }], pending: [], account: null })
})

test('signed out: favorites are kept in favorites.json and come back on the next start', async () => {
  setup()
  renderProbe()
  fireEvent.click(await screen.findByText('a'))
  expect(ids()).toBe('one')
  await waitFor(() => expect(disk?.local.map((f) => f.id)).toEqual([A.id]))
  expect(disk?.local[0]?.resource?.name).toBe('one')
  expect(calls.some(([m]) => m === 'setFavorite')).toBe(false)
  cleanup()
  renderProbe()
  await waitFor(() => expect(ids()).toBe('one'))
})

test('signing in merges the local favorites into the account', async () => {
  disk = { ...EMPTY, local: [{ id: A.id, resource: A }] }
  server = [B.id]
  session = 'sess-1'
  setup()
  renderProbe()
  await waitFor(() => expect(ids()).toBe('one,two'))
  expect(server).toEqual([A.id, B.id])
  await waitFor(() => expect(disk?.local).toEqual([]))
  expect(disk?.pending).toEqual([])
  expect(disk?.account?.userId).toBe('u1')
})

test('offline, a change stays queued on disk and is sent once the API answers', async () => {
  session = 'sess-1'
  let offline = true
  setup({
    setFavorite: (args) => {
      if (offline) throw new RpcError('fetch failed', 'StoreUnavailableError')
      const [, id, on] = args as [string, string, boolean]
      server = on ? [id, ...server] : server.filter((s) => s !== id)
      return null
    },
  })
  renderProbe()
  await waitFor(() => expect(calls.some(([m]) => m === 'listFavorites')).toBe(true))
  fireEvent.click(screen.getByText('c'))
  expect(ids()).toBe('three')
  await waitFor(() => expect(sync()).toBe('1|true|'))
  expect(disk?.pending.map((p) => p.id)).toEqual([C.id])
  offline = false
  fireEvent.click(screen.getByText('retry'))
  await waitFor(() => expect(sync()).toBe('0|false|'))
  expect(server).toEqual([C.id])
  expect(ids()).toBe('three')
})

test('a favorite the account refuses (full) is dropped and reported', async () => {
  session = 'sess-1'
  setup({
    setFavorite: () => {
      throw new RpcError('At most 500 favorites', 'FavoriteRejectedError', { reason: 'full' })
    },
  })
  renderProbe()
  await waitFor(() => expect(calls.some(([m]) => m === 'listFavorites')).toBe(true))
  fireEvent.click(screen.getByText('a'))
  await waitFor(() => expect(sync()).toBe(`0|false|${A.id}`))
  expect(ids()).toBe('')
})

test('a 401 refreshes the token once and sends the change again', async () => {
  session = 'sess-1'
  let first = true
  setup({
    setFavorite: (args) => {
      if (first) {
        first = false
        throw new RpcError('Unauthorized', 'SessionExpiredError')
      }
      server = [(args as string[])[1]!]
      return null
    },
  })
  renderProbe()
  await waitFor(() => expect(calls.some(([m]) => m === 'listFavorites')).toBe(true))
  fireEvent.click(screen.getByText('a'))
  await waitFor(() => expect(server).toEqual([A.id]))
  expect(calls.filter(([m]) => m === 'getAccessToken').length).toBeGreaterThanOrEqual(2)
  expect(sync()).toBe('0|false|')
})
