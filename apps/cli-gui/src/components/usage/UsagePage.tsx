import { useCallback, useEffect, useMemo, useState } from 'react'
import { Radio, Settings2 } from 'lucide-react'
import type { LocalRelayConfig, RelayStatus, UsageSummaryRow } from '@as/types'
import { callRpc } from '../../lib/rpc'
import { useT } from '../../i18n'
import { useAppState } from '../../state/AppState'
import { useNavigate } from '../../lib/useNavigate'
import { useAccountActions } from '../../lib/useAccountActions'
import {
  agentLabel,
  formatTokens,
  formatUsd,
  rowsInPeriod,
  successRate,
  usageBreakdown,
  usageTotals,
  USAGE_PERIODS,
  type UsagePeriod,
} from '../../lib/usage'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardTitle, Stat } from '../ui/card'
import { Segmented } from '../ui/segmented'
import { Banner, EmptyState, Skeleton } from '../ui/states'
import { cn } from '../ui/cn'
import { UsageTrendChart } from '../UsageTrendChart'
import { BudgetCard } from '../BudgetCard'
import { UsageExport } from '../UsageExport'
import { ProviderHealthCard } from '../ProviderHealthCard'
import { ProGate } from '../ProGate'

const PERIOD_KEY: Record<UsagePeriod, string> = { 1: 'usagePage.today', 7: 'usagePage.last7', 30: 'usagePage.last30' }

function RelayCard({ status, port, today }: { status: RelayStatus | null; port: number | null; today: UsageSummaryRow[] }) {
  const t = useT()
  const navigate = useNavigate()
  const { setSelectedSlug, setEditingConfigSlug, setShellDialog } = useAppState()
  const totals = usageTotals(today)
  const running = !!status?.running

  function openSettings() {
    navigate('providers')
    setEditingConfigSlug(null)
    setSelectedSlug('local')
  }

  return (
    <Card data-kind="provider">
      <CardTitle
        actions={
          <>
            <Button size="sm" onClick={() => setShellDialog('requestLog')}>
              <Radio />
              {t('usagePage.requestLog')}
            </Button>
            <Button size="sm" onClick={openSettings}>
              <Settings2 />
              {t('relay.settings')}
            </Button>
          </>
        }
      >
        <i
          aria-hidden
          className={cn(
            'mx-0.5 h-2 w-2 flex-none rounded-full',
            running ? 'bg-provider shadow-[0_0_0_3px_rgb(var(--provider-rgb)/0.18),0_0_10px_rgb(var(--provider-rgb)/0.8)]' : 'bg-fg-3'
          )}
        />
        {t('relay.title')}
        {status ? <Badge tone={running ? 'ok' : 'neutral'}>{running ? t('relay.running') : t('relay.stopped')}</Badge> : <Skeleton className="h-[22px] w-14" />}
      </CardTitle>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-xs max-[1040px]:grid-cols-1">
        <div>
          <dt className="text-fg-3">{t('relay.listen')}</dt>
          <dd className="mt-0.5 font-mono text-[13px] font-semibold">127.0.0.1{port != null ? `:${port}` : ''}</dd>
        </div>
        <div>
          <dt className="text-fg-3">
            {t('usagePage.today')} · {t('usagePage.requests')}
          </dt>
          <dd className="mt-0.5 font-mono text-[13px] font-semibold">{totals.requests}</dd>
        </div>
        <div>
          <dt className="text-fg-3">
            {t('usagePage.today')} · {t('usagePage.successRate')}
          </dt>
          <dd className="mt-0.5 font-mono text-[13px] font-semibold">{successRate(totals.successes, totals.requests)}</dd>
        </div>
      </dl>
      {status && !running && (
        <div className="mt-3">
          <Banner tone="warn">{t('relay.stoppedHint')}</Banner>
        </div>
      )}
      <p className="mt-2.5 text-xs text-fg-3">{t('relay.cliHint')}</p>
    </Card>
  )
}

function BreakdownTable({ rows }: { rows: UsageSummaryRow[] }) {
  const t = useT()
  const breakdown = usageBreakdown(rows)
  const th = 'whitespace-nowrap border-b border-line px-2.5 py-1.5 text-left text-[11.5px] font-medium text-fg-3'
  const td = 'whitespace-nowrap border-b border-line px-2.5 py-2'
  const num = 'text-right font-mono text-xs tabular-nums'
  return (
    <div className="-mx-1 mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px] [&_tr:last-child_td]:border-b-0">
        <thead>
          <tr>
            <th className={th}>{t('usagePage.provider')}</th>
            <th className={th}>{t('usagePage.model')}</th>
            <th className={th}>{t('usagePage.agent')}</th>
            <th className={cn(th, 'text-right')}>{t('usagePage.requests')}</th>
            <th className={cn(th, 'text-right')}>{t('usagePage.successRate')}</th>
            <th className={cn(th, 'text-right')}>{t('usagePage.input')}</th>
            <th className={cn(th, 'text-right')}>{t('usagePage.output')}</th>
            <th className={cn(th, 'text-right')}>{t('usagePage.cost')}</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map((b) => (
            <tr key={`${b.providerSlug}/${b.model}/${b.target}`}>
              <td className={cn(td, 'font-mono text-xs')}>{b.providerSlug}</td>
              <td className={cn(td, 'font-mono text-xs')}>{b.model}</td>
              <td className={td}>{agentLabel(b.target)}</td>
              <td className={cn(td, num)}>{b.requests.toLocaleString('en-US')}</td>
              <td className={cn(td, num)}>{successRate(b.successes, b.requests)}</td>
              <td className={cn(td, num)}>{formatTokens(b.inputTokens)}</td>
              <td className={cn(td, num)}>{formatTokens(b.outputTokens)}</td>
              <td className={cn(td, num)}>{formatUsd(b.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function UsagePage() {
  const t = useT()
  const navigate = useNavigate()
  const { setShellDialog } = useAppState()
  const account = useAccountActions()
  const [period, setPeriod] = useState<UsagePeriod>(7)
  const [rows, setRows] = useState<UsageSummaryRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [relay, setRelay] = useState<RelayStatus | null>(null)
  const [port, setPort] = useState<number | null>(null)

  const load = useCallback(() => {
    setFailed(false)
    setRows(null)
    callRpc<UsageSummaryRow[]>('getUsageSummary', [{ days: 30 }]).then(setRows, () => {
      setFailed(true)
      setRows([])
    })
  }, [])

  useEffect(() => {
    load()
    callRpc<RelayStatus>('getRelayStatus').then(setRelay, () => setRelay({ running: false }))
    callRpc<LocalRelayConfig[]>('listLocalConfigs').then((c) => setPort(c[0]?.port ?? null), () => undefined)
  }, [load])

  const inPeriod = useMemo(() => (rows ? rowsInPeriod(rows, period) : []), [rows, period])
  const today = useMemo(() => (rows ? rowsInPeriod(rows, 1) : []), [rows])
  const totals = usageTotals(inPeriod)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-6 pt-[18px] max-[1040px]:px-4">
      <div className="mb-3.5 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[19px] font-extrabold leading-[1.3]">{t('usagePage.title')}</h1>
          <p className="mb-0.5 text-[12.5px] text-fg-3">{t('usagePage.sub')}</p>
        </div>
        <Segmented
          className="ml-auto"
          label={t('usagePage.period')}
          value={period}
          onChange={setPeriod}
          options={USAGE_PERIODS.map((p) => ({ value: p, label: t(PERIOD_KEY[p]) }))}
        />
      </div>

      {failed && (
        <div className="mb-3">
          <Banner tone="error" title={t('usagePage.loadFailed')} actions={<Button size="sm" onClick={load}>{t('usagePage.retry')}</Button>} />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Card>
          <CardTitle>{t('usagePage.trend')}</CardTitle>
          {rows === null ? (
            <Skeleton className="mt-2.5 h-[170px] w-full" />
          ) : inPeriod.length === 0 ? (
            <div className="mt-2.5">
              <EmptyState
                kind="provider"
                title={t('usagePage.emptyTitle')}
                body={t('usagePage.emptyBody')}
                action={
                  <Button variant="primary" onClick={() => navigate('providers')}>
                    {t('usagePage.emptyCta')}
                  </Button>
                }
              />
            </div>
          ) : (
            <UsageTrendChart rows={inPeriod} />
          )}
        </Card>

        <div className="grid grid-cols-5 gap-3 max-[1040px]:grid-cols-2">
          <Stat label={t('usagePage.cost')} value={rows ? formatUsd(totals.costUsd) : '—'} />
          <Stat label={t('usagePage.tokens')} value={rows ? formatTokens(totals.tokens) : '—'} />
          <Stat label={t('usagePage.requests')} value={rows ? totals.requests.toLocaleString('en-US') : '—'} />
          <Stat label={t('usagePage.successRate')} value={successRate(totals.successes, totals.requests)} />
          <Stat label={t('usagePage.models')} value={rows ? String(totals.models) : '—'} />
        </div>

        <div className="grid items-start gap-3 [grid-template-columns:minmax(0,1.5fr)_minmax(0,1fr)] max-[1040px]:grid-cols-1">
          <div className="flex min-w-0 flex-col gap-3">
            {(rows === null || inPeriod.length > 0) && (
              <Card>
                <CardTitle
                  actions={
                    <Button size="sm" onClick={() => setShellDialog('requestLog')}>
                      {t('usagePage.requestLog')}
                    </Button>
                  }
                >
                  {t('usagePage.by')}
                </CardTitle>
                {rows === null ? <Skeleton className="mt-3 h-24 w-full" /> : <BreakdownTable rows={inPeriod} />}
                {totals.unpriced > 0 && (
                  <p className="mt-2 text-xs text-fg-3">{t('usagePage.unpriced').replace('{n}', String(totals.unpriced))}</p>
                )}
              </Card>
            )}
            <RelayCard status={relay} port={port} today={today} />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <ProGate
              feature="advancedUsageAnalytics"
              title={t('pro.budget.title')}
              description={t('pro.budget.desc')}
              onUpgrade={() => void account.upgrade()}
              upgradeBusy={account.busy}
            >
              <BudgetCard footer={<UsageExport />} />
            </ProGate>
            <ProGate
              feature="smartRouting"
              title={t('pro.smartRouting.title')}
              description={t('pro.smartRouting.desc')}
              onUpgrade={() => void account.upgrade()}
              upgradeBusy={account.busy}
            >
              <ProviderHealthCard />
            </ProGate>
          </div>
        </div>
      </div>
    </div>
  )
}
