import { useCallback, useEffect, useMemo, useState } from 'react'
import { Radio, Settings2 } from 'lucide-react'
import type { UsageSummaryRow } from '@as/types'
import { callRpc } from '../../lib/rpc'
import { useRelay } from '../../lib/useRelay'
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
  usageByDimension,
  usageTotals,
  USAGE_PERIODS,
  type UsageDimension,
  type UsagePeriod,
} from '../../lib/usage'
import { Button } from '../ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { RelayBadge, RelayDot, RelayListen, RelayNotices, RelayToggleButton } from '../relay/RelayParts'
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

function RelayCard({ today }: { today: UsageSummaryRow[] }) {
  const t = useT()
  const navigate = useNavigate()
  const { setSelectedSlug, setEditingConfigSlug, setShellDialog } = useAppState()
  const relay = useRelay()
  const totals = usageTotals(today)
  const status = relay.status

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
            <RelayToggleButton relay={relay} />
          </>
        }
      >
        <RelayDot status={status} />
        {t('relay.title')}
        {status ? <RelayBadge status={status} /> : relay.loadFailed ? null : <Skeleton className="h-[22px] w-14" />}
      </CardTitle>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-xs max-[1040px]:grid-cols-1">
        <div>
          <dt className="text-fg-3">{t('relay.listen')}</dt>
          <dd className="mt-0.5">{status ? <RelayListen status={status} /> : '—'}</dd>
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
      <RelayNotices relay={relay} />
      <p className="mt-2.5 text-xs text-fg-3">{t('relayCtl.cliHint')}</p>
      {relay.dialog}
    </Card>
  )
}

const TH = 'whitespace-nowrap border-b border-line px-2.5 py-1.5 text-left text-[11.5px] font-medium text-fg-3'
const TD = 'whitespace-nowrap border-b border-line px-2.5 py-2'
const NUM = 'text-right font-mono text-xs tabular-nums'

const DIMENSION_HEAD: Record<UsageDimension, string> = { provider: 'usagePage.provider', model: 'usagePage.model', agent: 'usagePage.agent' }

function GroupTable({ rows, dimension }: { rows: UsageSummaryRow[]; dimension: UsageDimension }) {
  const t = useT()
  const groups = usageByDimension(rows, dimension)
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px] [&_tr:last-child_td]:border-b-0">
        <thead>
          <tr>
            <th className={TH}>{t(DIMENSION_HEAD[dimension])}</th>
            <th className={cn(TH, 'text-right')}>{t('usagePage.requests')}</th>
            <th className={cn(TH, 'text-right')}>{t('usagePage.successRate')}</th>
            <th className={cn(TH, 'text-right')}>{t('usagePage.input')}</th>
            <th className={cn(TH, 'text-right')}>{t('usagePage.output')}</th>
            <th className={cn(TH, 'text-right')}>{t('usagePage.cost')}</th>
            <th className={cn(TH, 'text-right')}>{t('usageBy.share')}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key}>
              <td className={cn(TD, dimension !== 'agent' && 'font-mono text-xs')}>{dimension === 'agent' ? agentLabel(g.key) : g.key}</td>
              <td className={cn(TD, NUM)}>{g.requests.toLocaleString('en-US')}</td>
              <td className={cn(TD, NUM)}>{successRate(g.successes, g.requests)}</td>
              <td className={cn(TD, NUM)}>{formatTokens(g.inputTokens)}</td>
              <td className={cn(TD, NUM)}>{formatTokens(g.outputTokens)}</td>
              <td className={cn(TD, NUM)}>{formatUsd(g.costUsd)}</td>
              <td className={cn(TD, NUM)}>{g.costShare === null ? '—' : `${(g.costShare * 100).toFixed(1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type BreakdownView = UsageDimension | 'all'

const VIEWS: Array<[BreakdownView, string]> = [
  ['provider', 'usageBy.provider'],
  ['model', 'usageBy.model'],
  ['agent', 'usageBy.agent'],
  ['all', 'usageBy.all'],
]

function BreakdownCard({ rows, failed }: { rows: UsageSummaryRow[] | null; failed: boolean }) {
  const t = useT()
  const { setShellDialog } = useAppState()
  const [view, setView] = useState<BreakdownView>('provider')
  const totals = usageTotals(rows ?? [])
  let body
  if (failed) {
    body = <p className="mt-3 text-[12.5px] text-fg-3">{t('usageBy.failedShort')}</p>
  } else if (rows === null) {
    body = (
      <div role="status" aria-busy="true" aria-label={t('ui.loading')} className="mt-3">
        <Skeleton className="h-24 w-full" />
      </div>
    )
  } else if (rows.length === 0) {
    body = <p className="mt-3 rounded-box border border-dashed border-line-strong px-4 py-6 text-center text-[12.5px] text-fg-3">{t('usageBy.empty')}</p>
  } else {
    body = (
      <Tabs value={view} onValueChange={(v) => setView(v as BreakdownView)} className="mt-2.5">
        <TabsList aria-label={t('usageBy.view')}>
          {VIEWS.map(([v, key]) => (
            <TabsTrigger key={v} value={v}>
              {t(key)}
            </TabsTrigger>
          ))}
        </TabsList>
        {VIEWS.map(([v]) => (
          <TabsContent key={v} value={v} className="mt-2 focus-visible:outline-none">
            {v === 'all' ? <BreakdownTable rows={rows} /> : <GroupTable rows={rows} dimension={v} />}
          </TabsContent>
        ))}
      </Tabs>
    )
  }
  return (
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
      {body}
      {totals.unpriced > 0 && <p className="mt-2 text-xs text-fg-3">{t('usagePage.unpriced').replace('{n}', String(totals.unpriced))}</p>}
    </Card>
  )
}

function BreakdownTable({ rows }: { rows: UsageSummaryRow[] }) {
  const t = useT()
  const breakdown = usageBreakdown(rows)
  const th = TH
  const td = TD
  const num = NUM
  return (
    <div className="-mx-1 overflow-x-auto">
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
  const account = useAccountActions()
  const [period, setPeriod] = useState<UsagePeriod>(7)
  const [rows, setRows] = useState<UsageSummaryRow[] | null>(null)
  const [failed, setFailed] = useState(false)

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
          ) : failed ? (
            <p className="mt-2.5 text-[12.5px] text-fg-3">{t('usageBy.failedShort')}</p>
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

        <div className="grid grid-cols-5 gap-3">
          <Stat label={t('usagePage.cost')} value={rows ? formatUsd(totals.costUsd) : '—'} />
          <Stat label={t('usagePage.tokens')} value={rows ? formatTokens(totals.tokens) : '—'} />
          <Stat label={t('usagePage.requests')} value={rows ? totals.requests.toLocaleString('en-US') : '—'} />
          <Stat label={t('usagePage.successRate')} value={successRate(totals.successes, totals.requests)} />
          <Stat label={t('usagePage.models')} value={rows ? String(totals.models) : '—'} />
        </div>

        <BreakdownCard rows={rows === null ? null : inPeriod} failed={failed} />
        <div className="grid items-start gap-3 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] max-[860px]:grid-cols-1">
          <div className="flex min-w-0 flex-col gap-3">
            <RelayCard today={today} />
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
