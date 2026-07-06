import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import * as rpcModule from '../rpc'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { useSelectedDetail } from '../useSelectedDetail'

afterEach(() => { cleanup(); mock.restore() })

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
