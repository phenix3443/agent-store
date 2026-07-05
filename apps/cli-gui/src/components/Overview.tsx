import { useEffect, useState } from 'react'
import type { InstalledItem, LocalRelayConfig, RecentRequestRow, RelayStatus, UpdateAvailable, UsageSummaryRow } from '@aas/types'
import { callRpc } from '../lib/rpc'
import { useAppState } from '../state/AppState'
import { ProxyLogModal } from './ProxyLogModal'
import { UsageTrendChart } from './UsageTrendChart'

const CATEGORY_CARDS: { category: InstalledItem['category']; label: string }[] = [
  { category: 'provider', label: '供应商' },
  { category: 'skill', label: '技能' },
  { category: 'mcp', label: 'MCP' },
]

export function Overview() {
  const { setNavView, setCategoryFilter } = useAppState()
  const [installed, setInstalled] = useState<InstalledItem[]>([])
  const [today, setToday] = useState<UsageSummaryRow[]>([])
  const [last7Days, setLast7Days] = useState<UsageSummaryRow[]>([])
  const [last30Days, setLast30Days] = useState<UsageSummaryRow[]>([])
  const [relayStatus, setRelayStatus] = useState<RelayStatus>({ running: false })
  const [localConfigs, setLocalConfigs] = useState<LocalRelayConfig[]>([])
  const [recentRequests, setRecentRequests] = useState<RecentRequestRow[]>([])
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [updates, setUpdates] = useState<UpdateAvailable[]>([])

  useEffect(() => {
    callRpc<InstalledItem[]>('list').then(setInstalled)
  }, [])

  useEffect(() => {
    callRpc<UsageSummaryRow[]>('getUsageSummary', [{ days: 1 }]).then(setToday)
    callRpc<UsageSummaryRow[]>('getUsageSummary', [{ days: 7 }]).then(setLast7Days)
    callRpc<UsageSummaryRow[]>('getUsageSummary', [{ days: 30 }]).then(setLast30Days)
  }, [])

  useEffect(() => {
    callRpc<RelayStatus>('getRelayStatus').then(setRelayStatus)
    callRpc<LocalRelayConfig[]>('listLocalConfigs').then(setLocalConfigs)
  }, [])

  useEffect(() => {
    callRpc<RecentRequestRow[]>('getRecentRequests', [{ limit: 5 }]).then(setRecentRequests)
  }, [])

  useEffect(() => {
    callRpc<UpdateAvailable[]>('checkUpdates').then(setUpdates)
  }, [])

  function summarize(rows: UsageSummaryRow[]) {
    return rows.reduce(
      (acc, r) => ({
        requestCount: acc.requestCount + r.requestCount,
        successCount: acc.successCount + r.successCount,
        costUsd: acc.costUsd + r.costUsd,
        tokens: acc.tokens + r.inputTokens + r.outputTokens,
      }),
      { requestCount: 0, successCount: 0, costUsd: 0, tokens: 0 }
    )
  }

  function successRateLabel(summary: ReturnType<typeof summarize>) {
    if (summary.requestCount === 0) return '—'
    return `${Math.round((summary.successCount / summary.requestCount) * 100)}%`
  }

  function goToCategory(category: InstalledItem['category']) {
    setCategoryFilter(category)
    setNavView('browse')
  }

  async function updateOne(slug: string) {
    await callRpc('update', [slug])
    callRpc<UpdateAvailable[]>('checkUpdates').then(setUpdates)
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold text-store-text">概览</h1>

      <div className="grid grid-cols-3 gap-4">
        {CATEGORY_CARDS.map(({ category, label }) => (
          <button
            key={category}
            type="button"
            onClick={() => goToCategory(category)}
            className="flex flex-col items-start gap-1 rounded-xl border border-store-border bg-store-panel p-4 text-left hover:border-store-border-strong"
          >
            <span className="text-xs font-medium text-store-text-2">{label}</span>
            <span className="text-2xl font-semibold text-store-text">
              {installed.filter((i) => i.category === category).length}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-store-border bg-store-panel p-4">
        <p className="mb-3 text-sm font-medium text-store-text">消耗趋势</p>
        <div className="mb-4 grid grid-cols-3 gap-4 text-xs text-store-text-2">
          <div>
            <p>今日</p>
            <p className="text-base font-semibold text-store-text">{summarize(today).requestCount} 请求</p>
            <p>{summarize(today).tokens} tokens</p>
            <p>${summarize(today).costUsd.toFixed(4)}</p>
          </div>
          <div>
            <p>近 7 天</p>
            <p className="text-base font-semibold text-store-text">{summarize(last7Days).requestCount} 请求</p>
            <p>{summarize(last7Days).tokens} tokens</p>
            <p>${summarize(last7Days).costUsd.toFixed(4)}</p>
          </div>
          <div>
            <p>近 30 天</p>
            <p className="text-base font-semibold text-store-text">{summarize(last30Days).requestCount} 请求</p>
            <p>{summarize(last30Days).tokens} tokens</p>
            <p>${summarize(last30Days).costUsd.toFixed(4)}</p>
          </div>
        </div>
        <UsageTrendChart rows={last7Days} />
      </div>

      <button
        type="button"
        onClick={() => setNavView('local-relay')}
        className="flex flex-col items-start gap-1 rounded-xl border border-store-border bg-store-panel p-4 text-left hover:border-store-border-strong"
      >
        <p className="text-sm font-medium text-store-text">本地代理</p>
        <p className="text-xs text-store-text-2">
          {relayStatus.running
            ? `运行中 · ${localConfigs.length} 个监听配置 · 今日 ${summarize(today).requestCount} 请求 · 成功率 ${successRateLabel(summarize(today))}`
            : '未运行'}
        </p>
      </button>

      <div className="rounded-xl border border-store-border bg-store-panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-store-text">最近请求</p>
          <button type="button" onClick={() => setLogModalOpen(true)} className="text-xs text-store-accent hover:opacity-80">
            查看全部
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {recentRequests.map((row) => (
            <div key={row.id} className="flex items-center justify-between text-xs text-store-text-2">
              <span>{row.target} · {row.model}</span>
              <span>
                {row.providerSlug}
                {row.isFallback ? '（降级）' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ProxyLogModal open={logModalOpen} onOpenChange={setLogModalOpen} />

      {updates.length > 0 && (
        <div className="rounded-xl border border-store-border bg-store-panel p-4">
          <p className="mb-2 text-sm font-medium text-store-text">可更新</p>
          <div className="flex flex-col gap-1">
            {updates.slice(0, 4).map((item) => (
              <div key={item.slug} className="flex items-center justify-between text-xs">
                <span className="text-store-text">
                  {item.slug} v{item.currentVersion} → v{item.latestVersion}
                </span>
                <button
                  type="button"
                  onClick={() => updateOne(item.slug)}
                  className="rounded-md bg-store-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                >
                  更新
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
