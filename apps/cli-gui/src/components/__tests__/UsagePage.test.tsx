import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import type { Entitlements, UsageSummaryRow } from '@as/types'
import { settleRpc } from '../../test/settle'

mock.module('../../lib/openExternal', () => ({ openExternal: async () => {} }))
mock.module('../../lib/deepLink', () => ({ onDeepLink: async () => () => {} }))

const { UsagePage } = await import('../usage/UsagePage')
const { AppStateProvider, useAppState } = await import('../../state/AppState')
const { EntitlementProvider } = await import('../../state/Entitlement')
const { AuthProvider } = await import('../../state/Auth')

afterEach(async () => { cleanup(); await settleRpc(); mock.restore() })

const today = new Date().toISOString().slice(0, 10)
const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)

function row(o: Partial<UsageSummaryRow>): UsageSummaryRow {
  return {
    date: today, providerSlug: 'skyapi', target: 'claude', model: 'claude-sonnet-4-5',
    requestCount: 0, successCount: 0, unpricedRequestCount: 0,
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0,
    ...o,
  }
}

const FREE: Entitlements = { plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }
const PRO: Entitlements = { plan: 'pro', advancedUsageAnalytics: true, smartRouting: true, keyRotation: true }

function mockRpc({ rows = [], plan = FREE, running = true, fail = false }: { rows?: UsageSummaryRow[]; plan?: Entitlements; running?: boolean; fail?: boolean }) {
  const calls: [string, unknown[]][] = []
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push([method, args])
    if (method === 'getUsageSummary') {
      if (fail) throw new Error('db locked')
      return rows
    }
    if (method === 'getRelayStatus') return { running }
    if (method === 'listLocalConfigs') return [{ id: 'default', name: 'default', port: 18100, enabled: true, enabledFor: {} }]
    if (method === 'getEntitlements') return plan
    if (method === 'getBudgetStatus') return { monthlyLimitUsd: null, spentUsd: 0, monthStart: '2026-11-01', fraction: null, projectedUsd: 0, projectedOverBudget: false, alertLevel: 'none' }
    if (method === 'getBudget') return { monthlyLimitUsd: null, alertThresholds: [0.8, 1] }
    if (method === 'getProviderHealth') return []
    throw new Error(`unexpected RPC in UsagePage test: ${method}`)
  }) as typeof rpcModule.callRpc)
  return calls
}

function Probe() {
  const { navView, categoryFilter, selectedSlug, shellDialog } = useAppState()
  return <div data-testid="state">{`${navView}:${categoryFilter}:${selectedSlug ?? '-'}:${shellDialog ?? '-'}`}</div>
}

function renderPage() {
  return render(
    <AppStateProvider>
      <EntitlementProvider>
        <AuthProvider>
          <UsagePage />
          <Probe />
        </AuthProvider>
      </EntitlementProvider>
    </AppStateProvider>
  )
}

function stat(label: string) {
  return screen.getAllByText(label).find((el) => el.tagName === 'SMALL')!.nextElementSibling!.textContent
}

test('reads 30 days once and switches the period on the client', async () => {
  const calls = mockRpc({
    rows: [
      row({ requestCount: 4, successCount: 4, inputTokens: 1000, outputTokens: 500, costUsd: 0.5 }),
      row({ date: threeDaysAgo, model: 'gpt-5-codex', target: 'codex', providerSlug: 'openrouter', requestCount: 6, successCount: 5, costUsd: 1 }),
    ],
  })
  renderPage()

  await waitFor(() => expect(stat('请求数')).toBe('10'))
  expect(stat('费用')).toBe('$1.50')
  expect(stat('模型数')).toBe('2')
  expect(calls.filter(([m]) => m === 'getUsageSummary')).toEqual([['getUsageSummary', [{ days: 30 }]]])

  fireEvent.click(screen.getByRole('button', { name: '今日' }))
  await waitFor(() => expect(stat('请求数')).toBe('4'))
  expect(stat('Tokens')).toBe('1.5K')
  expect(stat('成功率')).toBe('100.0%')
  expect(screen.getByRole('button', { name: '今日' })).toHaveAttribute('aria-pressed', 'true')
})

test('breaks usage down by provider, model and agent', async () => {
  mockRpc({
    rows: [
      row({ requestCount: 2, successCount: 2, costUsd: 0.2 }),
      row({ date: threeDaysAgo, model: 'gpt-5-codex', target: 'codex', providerSlug: 'openrouter', requestCount: 1, successCount: 1, costUsd: 0.9, unpricedRequestCount: 0 }),
      row({ date: threeDaysAgo, requestCount: 3, successCount: 2, costUsd: 0.3, unpricedRequestCount: 1 }),
    ],
  })
  renderPage()

  const table = await screen.findByRole('table')
  const bodyRows = within(table).getAllByRole('row').slice(1)
  expect(bodyRows.map((r) => r.textContent)).toEqual([
    'openroutergpt-5-codexCodex1100.0%00$0.90',
    'skyapiclaude-sonnet-4-5Claude Code580.0%00$0.50',
  ])
  expect(screen.getByText('1 次请求没有价格数据，未计入费用。')).toBeInTheDocument()
})

test('shows the empty state when there is no usage, with a way to set up a provider', async () => {
  mockRpc({ rows: [] })
  renderPage()

  expect(await screen.findByText('暂无用量数据')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '配置供应商' }))
  expect(screen.getByTestId('state').textContent).toBe('browse:provider:-:-')
})

test('a failed read shows an error with retry', async () => {
  mockRpc({ fail: true })
  renderPage()

  expect(await screen.findByRole('alert')).toHaveTextContent('用量数据读取失败')
})

test('the relay card shows status and address, and opens the request log and relay settings', async () => {
  mockRpc({ rows: [row({ requestCount: 5, successCount: 4 })], running: false })
  renderPage()

  expect(await screen.findByText('已停止')).toBeInTheDocument()
  expect(screen.getByText('127.0.0.1:18100')).toBeInTheDocument()
  expect(screen.getByText('本地中转已停止。已指向中转的 agent 暂时发不出请求。')).toBeInTheDocument()
  expect(screen.getByText('今日 · 成功率').nextElementSibling?.textContent).toBe('80.0%')

  fireEvent.click(screen.getAllByRole('button', { name: '请求日志' })[0])
  expect(screen.getByTestId('state').textContent).toBe('browse:all:-:requestLog')

  fireEvent.click(screen.getByRole('button', { name: '中转设置' }))
  expect(screen.getByTestId('state').textContent).toBe('browse:provider:local:requestLog')
})

test('Free shows the budget and smart routing gates; Pro shows the budget, export and provider health', async () => {
  mockRpc({ rows: [row({ requestCount: 1, successCount: 1 })] })
  const { unmount } = renderPage()
  expect(await screen.findByText('预算与导出')).toBeInTheDocument()
  expect(screen.getByText('智能路由')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: '升级到 Pro' })).toHaveLength(2)
  expect(screen.queryByLabelText('月度预算')).not.toBeInTheDocument()
  unmount()
  await settleRpc()
  mock.restore()

  mockRpc({ rows: [row({ requestCount: 1, successCount: 1 })], plan: PRO })
  renderPage()
  expect(await screen.findByLabelText('月度预算')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '导出 CSV' })).toBeInTheDocument()
  expect(await screen.findByText('供应商健康')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '升级到 Pro' })).not.toBeInTheDocument()
})
