import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../../state/AppState'
import * as rpcModule from '../../lib/rpc'
import { InfoSidebar } from '../InfoSidebar'

afterEach(() => { cleanup(); mock.restore() })

const publisher = { id: 'p', slug: 'anthropic', name: 'anthropic', avatarUrl: '', tier: 'official' as const }

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) =>
    handlers[method]?.(...args)) as typeof rpcModule.callRpc)
}

function Select({ slug }: { slug: string }) {
  const { setSelectedSlug } = useAppState()
  return <button onClick={() => setSelectedSlug(slug)}>select</button>
}

function renderSidebar() {
  return render(
    <AppStateProvider>
      <Select slug="filesystem" />
      <InfoSidebar />
    </AppStateProvider>
  )
}

test('renders nothing but the frame with no selection', () => {
  const { container } = renderSidebar()
  expect(container.querySelector('h3')).toBeNull()
})

test('shows install info, tags and resource links for an installed item', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', readmeUrl: 'https://docs.example.com', icon: '',
      publisher, tags: ['fs', 'io'], downloads: 388000,
    }),
  })
  renderSidebar()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => expect(screen.getByText('安装信息')).toBeInTheDocument())
  expect(screen.getByText('filesystem')).toBeInTheDocument()
  expect(screen.getByText('v0.8.1')).toBeInTheDocument()
  expect(screen.getByText('fs')).toBeInTheDocument()
  expect(screen.getByText('io')).toBeInTheDocument()
  expect(screen.getByText('官网 / 文档')).toBeInTheDocument()
  expect(screen.queryByText('市场')).not.toBeInTheDocument()
})

test('shows the 市场 section (published/updated) for a not-yet-installed catalog item', async () => {
  mockRpc({
    info: () => { throw new Error('Item not installed: filesystem') },
    search: () => [{
      id: 'i1', slug: 'filesystem', name: 'filesystem', description: 'desc',
      readmeUrl: '', icon: '', category: 'mcp', version: '0.8.1', publisher,
      compatibleWith: ['claude'], tags: [], downloads: 10, rating: 4.5, status: 'published',
      installHook: { steps: [] }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
      configSchema: {},
    }],
  })
  renderSidebar()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => expect(screen.getByText('市场')).toBeInTheDocument())
})
