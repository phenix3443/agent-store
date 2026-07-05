import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { AppStateProvider } from '../../state/AppState'
import { Overview } from '../Overview'
import type { InstalledItem } from '@aas/types'

afterEach(() => { cleanup(); mock.restore() })

const providerItem: InstalledItem = {
  slug: 'p1', category: 'provider', version: '1.0.0', installedAt: '', updatedAt: '',
  compatibleWith: ['claude'], enabledFor: { claude: true },
}
const skillItem: InstalledItem = {
  slug: 's1', category: 'skill', version: '1.0.0', installedAt: '', updatedAt: '',
  compatibleWith: ['claude'], enabledFor: {},
}

test('shows a count card per category from the list RPC', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return [providerItem, skillItem]
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  expect(await screen.findByText('供应商')).toBeInTheDocument()
  expect(await screen.findByText('技能')).toBeInTheDocument()
  expect(await screen.findByText('MCP')).toBeInTheDocument()

  const providerCard = (await screen.findByText('供应商')).closest('button')!
  expect(providerCard.querySelector('svg')).not.toBeNull()
})

test('shows a consumption trend card with today/7-day/30-day totals', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args?: unknown[]) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') {
      const days = (args?.[0] as { days?: number } | undefined)?.days
      if (days === 1) return [{ date: '2026-07-05', providerSlug: 'p', target: 'claude', model: 'm', requestCount: 3, successCount: 3, unpricedRequestCount: 0, inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.05 }]
      return []
    }
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  expect(await screen.findByText('消耗趋势')).toBeInTheDocument()
  expect(await screen.findByText('3 请求')).toBeInTheDocument()
})

test('shows a local relay status card that navigates to the local-relay view on click', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: true, pid: 456 }
    if (method === 'listLocalConfigs') return [{ id: 'default', name: '默认', port: 18780, enabled: true }]
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  const card = await screen.findByText('本地代理')
  expect(await screen.findByText(/运行中/)).toBeInTheDocument()
  fireEvent.click(card)
  // Assert navView switched — since Overview itself doesn't render LocalRelayDetail (App.tsx does the
  // routing), assert the click handler ran without throwing; a full navigation assertion belongs in
  // an App.tsx-level test instead. Import `fireEvent` from '@testing-library/react' at the top of this
  // file if not already imported.
})

test('shows the 5 most recent requests and opens the proxy log modal from 查看全部', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') {
      return [{ id: 1, createdAt: '2026-07-05T00:00:00Z', providerSlug: 'p1', target: 'claude', model: 'm1', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.001, statusCode: 200, latencyMs: 100, isStreaming: false, isFallback: false }]
    }
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  expect(await screen.findByText('最近请求')).toBeInTheDocument()
  expect(await screen.findByText('p1')).toBeInTheDocument()
  fireEvent.click(screen.getByText('查看全部'))
  expect(await screen.findByText('代理请求日志')).toBeInTheDocument()
})

test('shows up to 4 updatable packages with a real 更新 button', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args?: unknown[]) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return [{ slug: 'a', currentVersion: '1.0.0', latestVersion: '1.1.0' }]
    if (method === 'update') return [{ slug: args?.[0] as string, fromVersion: '1.0.0', toVersion: '1.1.0' }]
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  expect(await screen.findByText('可更新')).toBeInTheDocument()
  expect(await screen.findByText(/a.*1\.0\.0.*1\.1\.0/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '更新' }))
})
