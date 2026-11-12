import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import * as rpcModule from '../rpc'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { useSelectedDetail } from '../useSelectedDetail'
import { settleRpc } from '../../test/settle'

afterEach(async () => { cleanup(); await settleRpc(); mock.restore() })

function Select({ slug }: { slug: string }) {
  const { setSelectedSlug } = useAppState()
  return <button onClick={() => setSelectedSlug(slug)}>select</button>
}

function Probe() {
  const detail = useSelectedDetail()
  return <span>{detail ? 'has-detail' : 'no-detail'}</span>
}

test('fetches local as a normal provider via the info RPC', async () => {
  const publisher = { id: 'p', slug: 'agent-store', name: 'Agent Store', avatarUrl: '', tier: 'official' as const }
  const calls: string[] = []
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push(method)
    if (method === 'info' && args[0] === 'local') {
      return {
        slug: 'local', category: 'provider', version: '1.0.0', installedAt: '', updatedAt: '',
        compatibleWith: ['claude', 'codex'], enabledFor: {}, name: 'local', description: '',
 publisher, tags: [], downloads: 0,
      }
    }
    throw new Error(`unexpected RPC: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(
    <AppStateProvider>
      <Select slug="local" />
      <Probe />
    </AppStateProvider>
  )

  screen.getByText('select').click()

  expect(await screen.findByText('has-detail')).toBeInTheDocument()
  expect(calls).toContain('info')
})

function Kind() {
  const detail = useSelectedDetail()
  return <span>{detail ? `${detail.installed ? 'installed' : 'catalog'}:${detail.slug}` : 'none'}</span>
}

function mockCalls(handlers: Record<string, (...args: unknown[]) => unknown>, calls: string[] = []) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push(`${method}(${args.join(',')})`)
    const h = handlers[method]
    if (!h) throw new Error(`unexpected RPC: ${method}`)
    return h(...args)
  }) as typeof rpcModule.callRpc)
}

const resource = {
  id: 'github:o/r/s', kind: 'skill', name: 's', description: 'd', author: null, version: 'abc', homepageUrl: null,
  installs: null, verified: false, tags: [], transports: [],
  origin: { site: 'github', upstreamId: 'o/r/s', url: null, upstreamVersion: null, upstreamUpdatedAt: null, syncedAt: '', unavailableAt: null, unavailableReason: null },
  slug: 'r-s',
}

test('a catalog id that is not installed shows the catalog entry and its install preview', async () => {
  const calls: string[] = []
  mockCalls({ list: () => [], getResource: () => ({ ...resource, install: { slug: 'r-s', category: 'skill', name: 's' } }) }, calls)
  render(<AppStateProvider><Select slug="github:o/r/s" /><Kind /></AppStateProvider>)
  screen.getByText('select').click()
  expect(await screen.findByText('catalog:r-s')).toBeInTheDocument()
  expect(calls).toEqual(['list()', 'getResource(github:o/r/s)'])
})

test('a catalog id that is installed shows what is on disk', async () => {
  mockCalls({
    list: () => [{ slug: 'r-s', category: 'skill', resourceId: 'github:o/r/s' }],
    info: (slug) => ({ slug, category: 'skill', name: 's', publisher: {}, tags: [] }),
  })
  render(<AppStateProvider><Select slug="github:o/r/s" /><Kind /></AppStateProvider>)
  screen.getByText('select').click()
  expect(await screen.findByText('installed:r-s')).toBeInTheDocument()
})

test('a slug that is not installed falls back to the catalog; nothing anywhere shows no detail', async () => {
  const calls: string[] = []
  mockCalls({ info: () => { throw new Error('Item not installed') }, getResource: () => { throw new Error('Not in the catalog') } }, calls)
  render(<AppStateProvider><Select slug="nope" /><Kind /></AppStateProvider>)
  screen.getByText('select').click()
  await waitFor(() => expect(calls).toEqual(['info(nope)', 'getResource(nope)']))
  expect(screen.getByText('none')).toBeInTheDocument()
})
