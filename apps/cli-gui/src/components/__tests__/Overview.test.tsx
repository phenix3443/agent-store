import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { AppStateProvider, useAppState } from '../../state/AppState'
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
  const label = await screen.findByText('总请求数')
  expect(label.nextElementSibling?.textContent).toBe('3')
})

test('trend card shows a tab selector and switches stats between periods', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args?: unknown[]) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') {
      const days = (args?.[0] as { days?: number } | undefined)?.days
      if (days === 1) return [{ date: '2026-07-05', providerSlug: 'p', target: 'claude', model: 'a', requestCount: 3, successCount: 3, unpricedRequestCount: 0, inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01 }]
      if (days === 7) return [{ date: '2026-07-05', providerSlug: 'p', target: 'claude', model: 'a', requestCount: 20, successCount: 20, unpricedRequestCount: 0, inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.05 }]
      return []
    }
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  const label = await screen.findByText('总请求数')
  expect(label.nextElementSibling?.textContent).toBe('3')

  fireEvent.click(screen.getByText('近 7 天'))

  await waitFor(() => expect(label.nextElementSibling?.textContent).toBe('20'))
})

test('trend card shows a distinct-model count as 模型分布', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args?: unknown[]) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') {
      const days = (args?.[0] as { days?: number } | undefined)?.days
      if (days === 1) {
        return [
          { date: '2026-07-05', providerSlug: 'p', target: 'claude', model: 'a', requestCount: 1, successCount: 1, unpricedRequestCount: 0, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
          { date: '2026-07-05', providerSlug: 'p', target: 'codex', model: 'b', requestCount: 1, successCount: 1, unpricedRequestCount: 0, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
        ]
      }
      return []
    }
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  expect(await screen.findByText('模型分布')).toBeInTheDocument()
  const modelStat = (await screen.findByText('模型分布')).closest('div')!
  expect(modelStat.textContent).toContain('2')
})

function StateProbe() {
  const { navView, categoryFilter, selectedSlug } = useAppState()
  return <div data-testid="state">{navView}:{categoryFilter}:{selectedSlug ?? 'none'}</div>
}

test('shows a local relay status card that navigates to the local provider on click', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: true, pid: 456 }
    if (method === 'listLocalConfigs') return [{ id: 'default', name: '默认', port: 18780, enabled: true }]
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /><StateProbe /></AppStateProvider>)

  const card = await screen.findByText('local')
  expect(await screen.findByText(/运行中/)).toBeInTheDocument()
  fireEvent.click(card)

  expect(screen.getByTestId('state').textContent).toBe('browse:provider:local')
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
  expect(await screen.findByText(/p1/)).toBeInTheDocument()
  fireEvent.click(screen.getByText('查看全部'))
  expect(await screen.findByText('本地代理 · 请求日志')).toBeInTheDocument()
})

test('recent request rows show a colored status dot and mapped client name', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') {
      return [{ id: 1, createdAt: '2026-07-05T00:00:00Z', providerSlug: 'p1', target: 'claude', model: 'm1', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.001, statusCode: 502, latencyMs: 100, isStreaming: false, isFallback: false }]
    }
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  expect(await screen.findByText('Claude Code')).toBeInTheDocument()
  expect(await screen.findByText('502')).toHaveClass('text-store-red')
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
  expect(await screen.findByText('a')).toBeInTheDocument()
  expect(await screen.findByText(/1\.0\.0.*1\.1\.0/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '更新' }))
})
