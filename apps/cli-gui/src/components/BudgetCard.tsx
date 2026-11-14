import { useEffect, useState, type ReactNode } from 'react'
import type { BudgetConfig, BudgetStatus } from '@as/types'
import { callRpc } from '../lib/rpc'
import { useT } from '../i18n'
import { formatUsd } from '../lib/usage'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Skeleton } from './ui/states'
import { cn } from './ui/cn'
import { ProBadge } from './ProGate'

/** Monthly spend against a budget: set a limit, see spend and the month-end projection, warn near or over it. */
export function BudgetCard({ footer }: { footer?: ReactNode }) {
  const t = useT()
  const [status, setStatus] = useState<BudgetStatus | null>(null)
  const [thresholds, setThresholds] = useState<number[]>([0.8, 1])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function reload() {
    callRpc<BudgetStatus>('getBudgetStatus').then(setStatus, () => undefined)
    callRpc<BudgetConfig>('getBudget').then(
      (c) => {
        setThresholds(c.alertThresholds)
        setDraft(c.monthlyLimitUsd != null ? String(c.monthlyLimitUsd) : '')
      },
      () => undefined
    )
  }
  useEffect(reload, [])

  async function save() {
    const trimmed = draft.trim()
    const limit = trimmed === '' ? null : Number(trimmed)
    if (limit != null && (!Number.isFinite(limit) || limit < 0)) {
      setError(t('budget.invalid'))
      return
    }
    setError(null)
    setBusy(true)
    try {
      await callRpc<BudgetConfig>('setBudget', [{ monthlyLimitUsd: limit, alertThresholds: thresholds }])
      reload()
    } catch {
      setError(t('budget.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const level = status?.alertLevel ?? 'none'
  const pct = status?.fraction != null ? Math.min(status.fraction, 1) * 100 : 0

  return (
    <Card>
      <CardTitle>
        {t('budget.title')}
        <ProBadge />
      </CardTitle>
      <p className="mt-1 text-[12.5px] text-fg-2">{t('budget.desc')}</p>

      <form
        noValidate
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <span className="text-fg-3">$</span>
        <Input
          type="number"
          min="0"
          step="1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('budget.placeholder')}
          aria-label={t('budget.ariaLabel')}
          invalid={!!error}
          className="max-w-[200px]"
        />
        <Button type="submit" disabled={busy}>
          {t('common.save')}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-bad">
          {error}
        </p>
      )}

      {!status ? (
        <Skeleton className="mt-3 h-2 w-full" />
      ) : status.monthlyLimitUsd == null ? (
        <p className="mt-2.5 text-[12.5px] text-fg-3">{t('budget.none')}</p>
      ) : (
        <>
          <div
            role="meter"
            aria-label={t('budget.spent')}
            aria-valuemin={0}
            aria-valuemax={status.monthlyLimitUsd}
            aria-valuenow={status.spentUsd}
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-panel-2"
          >
            <div
              className={cn('h-full rounded-full', level === 'over' ? 'bg-bad' : level === 'warn' ? 'bg-warn' : 'bg-provider')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
            <dt className="text-fg-3">{t('budget.spent')}</dt>
            <dd className="font-mono">
              {formatUsd(status.spentUsd)} / {formatUsd(status.monthlyLimitUsd)}
              {status.fraction != null && <span className="ml-2 text-fg-3">{Math.round(status.fraction * 100)}%</span>}
            </dd>
            <dt className="text-fg-3">{t('budget.projected')}</dt>
            <dd className="flex flex-wrap items-center gap-2 font-mono">
              <span className={status.projectedOverBudget ? 'text-warn' : undefined}>{formatUsd(status.projectedUsd)}</span>
              {level !== 'none' && (
                <Badge tone={level === 'over' ? 'bad' : 'warn'} className="font-sans">
                  {level === 'over' ? t('budget.overBudget') : t('budget.nearLimit')}
                </Badge>
              )}
            </dd>
          </dl>
        </>
      )}
      {footer && <div className="mt-3.5 border-t border-line pt-3">{footer}</div>}
    </Card>
  )
}
