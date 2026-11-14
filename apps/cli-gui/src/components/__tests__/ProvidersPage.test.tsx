import { test, expect, afterEach, beforeEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { settleRpc } from '../../test/settle'

mock.module('../../lib/openExternal', () => ({ openExternal: async () => {} }))

const { ProvidersPage } = await import('../library/ProvidersPage')
const { AppStateProvider } = await import('../../state/AppState')
const { EntitlementProvider } = await import('../../state/Entitlement')
const { TerminalLogProvider } = await import('../../state/TerminalLog')
const { TooltipProvider } = await import('../ui/tooltip')

const realRect = Element.prototype.getBoundingClientRect
// happy-dom lays nothing out; give each provider row its own 58px slot so the keyboard sensor can move between them.
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const list = this.parentElement
    const index = list?.getAttribute('aria-label') === '按优先级排列，Level 数字小的先试' ? Array.from(list.children).indexOf(this) : 0
    const top = index * 58
    return { x: 0, y: top, top, left: 0, right: 600, bottom: top + 58, width: 600, height: 58, toJSON: () => ({}) } as DOMRect
  }
})
afterEach(async () => {
  Element.prototype.getBoundingClientRect = realRect
  cleanup()
  await settleRpc()
  mock.restore()
})

const publisher = { id: 'p', slug: 'x', name: 'x', avatarUrl: '', tier: 'community' as const }

function provider(slug: string, level: number, enabledFor: Record<string, boolean> = {}, extra: Record<string, unknown> = {}) {
  return {
    slug, category: 'provider', version: '1.0.0', installedAt: '', updatedAt: '', compatibleWith: ['claude', 'codex'], enabledFor,
    name: slug, description: '', publisher, tags: [], downloads: 0,
    currentConfig: { name: slug.toUpperCase(), apiKey: 'sk-x', baseUrl: `https://${slug}.example`, level, ...extra },
  }
}

function mockRpc(items: ReturnType<typeof provider>[], handlers: Record<string, (...args: unknown[]) => unknown> = {}) {
  const calls: [string, unknown[]][] = []
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push([method, args])
    if (handlers[method]) return handlers[method]!(...args)
    if (method === 'list') return items.map(({ currentConfig: _c, ...rest }) => rest)
    if (method === 'info') return items.find((i) => i.slug === args[0])
    if (method === 'checkUpdates') return []
    if (method === 'getEntitlements') return { plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }
    if (method === 'getRelayStatus') return { running: true, pid: 7, listeners: [{ id: 'default', name: '默认', port: 18780, listening: true }], routedAgents: { claude: true, codex: false } }
    return undefined
  }) as typeof rpcModule.callRpc)
  return calls
}

function renderPage() {
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <EntitlementProvider>
          <TooltipProvider>
            <ProvidersPage />
          </TooltipProvider>
        </EntitlementProvider>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

// The keyboard sensor starts listening on the document one tick after the key that picks a row up.
async function press(code: string, target: Element) {
  await act(async () => {
    fireEvent.keyDown(target, { code, key: code === 'Space' ? ' ' : code })
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
}

async function moveFirstDown() {
  const first = handles()[0]!
  first.focus()
  await press('Space', first)
  await press('ArrowDown', document.activeElement ?? first)
  await press('Space', document.activeElement ?? first)
}

const handles = () => screen.getAllByRole('button', { name: /^拖动调整 .+ 的优先级$/ })

test('lists providers the way the relay tries them: Level, then install order', async () => {
  mockRpc([provider('zeta', 2), provider('beta', 1), provider('alpha', 2)])
  renderPage()
  await waitFor(() => expect(handles()).toHaveLength(3))
  expect(handles().map((h) => h.getAttribute('aria-label'))).toEqual(['拖动调整 BETA 的优先级', '拖动调整 ZETA 的优先级', '拖动调整 ALPHA 的优先级'])
})

test('the relay card follows the agents that really point at the relay', async () => {
  mockRpc([provider('one', 1, { claude: true }), provider('two', 2, { claude: true }), provider('three', 3, { claude: true })])
  renderPage()
  expect(await screen.findByText('127.0.0.1:18780', { selector: 'span.font-semibold' })).toBeInTheDocument()
  expect(screen.getByText('未接入本地中转')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument()
  const cut = await screen.findByTitle('Free 方案只使用前 2 个上游')
  expect(cut).toHaveTextContent('THREE')
})

test('the keyboard reorders providers and saves the order as Level 1, 2, 3', async () => {
  const setProviderOrder = mock((slugs: unknown) => (slugs as string[]).map((slug, i) => ({ slug, level: i + 1 })))
  const calls = mockRpc([provider('one', 1), provider('two', 2), provider('three', 3)], { setProviderOrder })
  renderPage()
  await waitFor(() => expect(handles()).toHaveLength(3))

  await moveFirstDown()

  await waitFor(() => expect(setProviderOrder).toHaveBeenCalledWith(['two', 'one', 'three']))
  expect(calls.filter(([m]) => m === 'setProviderOrder')).toHaveLength(1)
})

test('a failed save puts the order back and says so', async () => {
  mockRpc([provider('one', 1), provider('two', 2)], {
    setProviderOrder: () => {
      throw new Error('config.json is not a JSON object')
    },
  })
  renderPage()
  await waitFor(() => expect(handles()).toHaveLength(2))
  await moveFirstDown()
  expect(await screen.findByText('优先级没有保存，顺序保持原样')).toBeInTheDocument()
  expect(handles().map((h) => h.getAttribute('aria-label'))).toEqual(['拖动调整 ONE 的优先级', '拖动调整 TWO 的优先级'])
})
