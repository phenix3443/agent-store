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
const { TerminalLogProvider } = await import('../../state/TerminalLog')

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

const LISTENING = [{ id: 'default', name: '默认', port: 18780, listening: true }]

function mockRpc({
  rows = [],
  plan = FREE,
  running = true,
  fail = false,
  relay,
}: {
  rows?: UsageSummaryRow[]
  plan?: Entitlements
  running?: boolean
  fail?: boolean
  relay?: Partial<Record<string, (args: unknown[]) => unknown>>
}) {
  const calls: [string, unknown[]][] = []
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push([method, args])
    if (relay?.[method]) return relay[method]!(args)
    if (method === 'getUsageSummary') {
      if (fail) throw new Error('db locked')
      return rows
    }
    if (method === 'getRelayStatus') return running ? { running, pid: 42, listeners: LISTENING, routedAgents: {} } : { running, routedAgents: {} }
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
      <TerminalLogProvider>
        <EntitlementProvider>
          <AuthProvider>
            <UsagePage />
            <Probe />
          </AuthProvider>
        </EntitlementProvider>
      </TerminalLogProvider>
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

  const bodyRows = async () => within(await screen.findByRole('table')).getAllByRole('row').slice(1).map((r) => r.textContent)
  expect(await bodyRows()).toEqual(['openrouter1100.0%00$0.9064.3%', 'skyapi580.0%00$0.5035.7%'])
  expect(screen.getByRole('tab', { name: '按供应商' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('1 次请求没有价格数据，未计入费用。')).toBeInTheDocument()

  fireEvent.mouseDown(screen.getByRole('tab', { name: '按模型' }))
  expect(await bodyRows()).toEqual(['gpt-5-codex1100.0%00$0.9064.3%', 'claude-sonnet-4-5580.0%00$0.5035.7%'])

  fireEvent.mouseDown(screen.getByRole('tab', { name: '按 agent' }))
  expect(await bodyRows()).toEqual(['Codex1100.0%00$0.9064.3%', 'Claude Code580.0%00$0.5035.7%'])

  fireEvent.mouseDown(screen.getByRole('tab', { name: '全部明细' }))
  expect(await bodyRows()).toEqual([
    'openroutergpt-5-codexCodex1100.0%00$0.90',
    'skyapiclaude-sonnet-4-5Claude Code580.0%00$0.50',
  ])
})

test('the breakdown shows its loading and empty states', async () => {
  let resolve!: (rows: UsageSummaryRow[]) => void
  mockRpc({ relay: { getUsageSummary: () => new Promise((r) => { resolve = r }) } })
  renderPage()
  expect(await screen.findByRole('status', { name: '加载中' })).toBeInTheDocument()
  resolve([])
  expect(await screen.findByText('这段时间没有经过本地中转的请求。')).toBeInTheDocument()
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
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
  expect(screen.getAllByText('用量数据读取失败。')).toHaveLength(2)
  expect(screen.queryByText('暂无用量数据')).not.toBeInTheDocument()
})

test('the relay card shows status and address, and opens the request log and relay settings', async () => {
  mockRpc({ rows: [row({ requestCount: 5, successCount: 4 })], running: false })
  renderPage()

  expect(await screen.findByText('已停止')).toBeInTheDocument()
  expect(screen.getByText('本地中转已停止。现在没有 agent 指向中转。对 agent 启用供应商时会自动启动它。')).toBeInTheDocument()
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

test('the relay card starts the relay and shows where it listens', async () => {
  let running = false
  const calls = mockRpc({
    relay: {
      getRelayStatus: () => (running ? { running, pid: 42, listeners: LISTENING, routedAgents: {} } : { running, routedAgents: {} }),
      startRelay: () => {
        running = true
        return { running, pid: 42, listeners: LISTENING, routedAgents: {} }
      },
    },
  })
  renderPage()

  fireEvent.click(await screen.findByRole('button', { name: '启动' }))
  expect(await screen.findByText('127.0.0.1:18780')).toBeInTheDocument()
  expect(screen.getByText('运行中')).toBeInTheDocument()
  expect(calls.some(([m]) => m === 'startRelay')).toBe(true)
  expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument()
})

test('a port another program holds is shown with the reason', async () => {
  mockRpc({
    relay: {
      getRelayStatus: () => ({
        running: true,
        pid: 42,
        listeners: [{ id: 'default', name: '默认', port: 18780, listening: false, code: 'EADDRINUSE', error: 'Failed to start server. Is port 18780 in use?' }],
        routedAgents: { claude: true },
      }),
    },
  })
  renderPage()

  expect(await screen.findByText('端口 18780 被其他程序占用')).toBeInTheDocument()
  expect(screen.getAllByText('未在监听').length).toBeGreaterThan(0)
  expect(screen.getByText('EADDRINUSE: Failed to start server. Is port 18780 in use?')).toBeInTheDocument()
})

test('stopping while an agent points at the relay asks first and says what happens', async () => {
  let running = true
  const calls = mockRpc({
    relay: {
      getRelayStatus: () => ({ running, ...(running ? { pid: 42, listeners: LISTENING } : {}), routedAgents: { claude: true, codex: false } }),
      stopRelay: () => {
        running = false
        return { running, routedAgents: { claude: true, codex: false } }
      },
    },
  })
  renderPage()

  fireEvent.click(await screen.findByRole('button', { name: '停止' }))
  const dialog = await screen.findByRole('dialog', { name: '停止本地中转？' })
  expect(dialog).toHaveTextContent('Claude Code 的配置指向 127.0.0.1:18780')
  expect(calls.some(([m]) => m === 'stopRelay')).toBe(false)

  fireEvent.click(within(dialog).getByRole('button', { name: '停止' }))
  expect(await screen.findByText('本地中转已停止。Claude Code 的配置仍指向 127.0.0.1:18780，暂时发不出请求。')).toBeInTheDocument()
  expect(calls.some(([m]) => m === 'stopRelay')).toBe(true)
})

test('a relay that exits right after starting says so', async () => {
  mockRpc({ running: false, relay: { startRelay: () => ({ running: false, routedAgents: {} }) } })
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: '启动' }))
  expect(await screen.findByText('中转进程启动后立即退出了，没有留下原因。')).toBeInTheDocument()
})
