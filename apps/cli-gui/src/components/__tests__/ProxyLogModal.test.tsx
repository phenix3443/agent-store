import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { ProxyLogModal } from '../ProxyLogModal'
import type { LocalRelayConfig, RecentRequestRow } from '@as/types'

afterEach(() => { cleanup(); mock.restore() })

function row(overrides: Partial<RecentRequestRow>): RecentRequestRow {
  return {
    id: 1, createdAt: '2026-07-05T00:00:00Z', providerSlug: 'p1', target: 'claude', model: 'm1',
    inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.001,
    statusCode: 200, latencyMs: 500, isStreaming: false, isFallback: false,
    ...overrides,
  }
}

function mockRpc(rows: RecentRequestRow[], localConfigs: LocalRelayConfig[] = []) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'getRecentRequests') return rows
    if (method === 'listLocalConfigs') return localConfigs
    throw new Error(`unexpected RPC in ProxyLogModal test: ${method}`)
  }) as typeof rpcModule.callRpc)
}

test('shows title and subtitle with relay address', async () => {
  mockRpc([row({})], [{ id: 'c1', name: 'default', port: 8787, enabled: true } as LocalRelayConfig])

  render(<ProxyLogModal open onOpenChange={() => {}} />)

  expect(await screen.findByText('本地代理 · 请求日志')).toBeInTheDocument()
  expect(await screen.findByText((_, el) => el?.textContent === '127.0.0.1:8787 · 按 Level 顺序转发，失败自动降级')).toBeInTheDocument()
})

test('shows recent request rows with provider route and fallback badge', async () => {
  mockRpc([row({ id: 2, providerSlug: 'backup', isFallback: true }), row({ id: 1 })])

  render(<ProxyLogModal open onOpenChange={() => {}} />)

  expect(await screen.findByText((_, el) => el?.textContent === '→ p1')).toBeInTheDocument()
  expect(await screen.findByText((_, el) => el?.textContent === '→ backup')).toBeInTheDocument()
  expect(await screen.findByText('降级')).toBeInTheDocument()
})

test('does not show fallback badge for non-fallback rows', async () => {
  mockRpc([row({ id: 1, isFallback: false })])

  render(<ProxyLogModal open onOpenChange={() => {}} />)

  await screen.findByText((_, el) => el?.textContent === '→ p1')
  expect(screen.queryByText('降级')).not.toBeInTheDocument()
})

test('does not fetch when closed', () => {
  const spy = spyOn(rpcModule, 'callRpc')
  render(<ProxyLogModal open={false} onOpenChange={() => {}} />)
  expect(spy).not.toHaveBeenCalled()
})
