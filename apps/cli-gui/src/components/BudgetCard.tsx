import { useEffect, useState } from 'react'
import { Wallet, AlertTriangle, Pencil } from 'lucide-react'
import type { BudgetConfig, BudgetStatus } from '@as/types'
import { callRpc } from '../lib/rpc'
import { useT } from '../i18n'

/** Monthly spend-vs-budget widget: set a limit, track spend, project month-end, warn on overspend. */
export function BudgetCard() {
  const t = useT()
  const [status, setStatus] = useState<BudgetStatus | null>(null)
  const [thresholds, setThresholds] = useState<number[]>([0.8, 1])
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  function reload() {
    callRpc<BudgetStatus>('getBudgetStatus').then(setStatus)
    callRpc<BudgetConfig>('getBudget').then((c) => {
      setThresholds(c.alertThresholds)
      setDraft(c.monthlyLimitUsd != null ? String(c.monthlyLimitUsd) : '')
    })
  }
  useEffect(reload, [])

  async function save() {
    const trimmed = draft.trim()
    const limit = trimmed === '' ? null : Number(trimmed)
    if (limit != null && (!Number.isFinite(limit) || limit < 0)) return
    await callRpc<BudgetConfig>('setBudget', [{ monthlyLimitUsd: limit, alertThresholds: thresholds }])
    setEditing(false)
    reload()
  }

  if (!status) return null

  const hasLimit = status.monthlyLimitUsd != null
  const pct = status.fraction != null ? Math.min(status.fraction, 1) * 100 : 0
  const barColor =
    status.alertLevel === 'over' ? 'bg-store-red' : status.alertLevel === 'warn' ? 'bg-store-amber' : 'bg-store-accent'

  return (
    <div className="rounded-xl border border-store-border bg-store-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-store-panel-2 text-store-text">
            <Wallet size={16} />
          </div>
          <div>
            <p className="text-sm font-medium text-store-text">{t('budget.title')}</p>
            <p className="text-xs text-store-text-2">{status.monthStart.slice(0, 7)} {t('budget.sub')}</p>
          </div>
        </div>
        {hasLimit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs text-store-accent hover:opacity-80"
          >
            <Pencil size={12} /> {t('budget.edit')}
          </button>
        )}
      </div>

      {editing || !hasLimit ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-store-text-2">$</span>
          <input
            type="number"
            min="0"
            step="1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('budget.placeholder')}
            aria-label={t('budget.ariaLabel')}
            className="flex-1 rounded-md border border-store-border bg-store-panel-2 px-2 py-1.5 text-sm text-store-text outline-none focus:border-store-accent"
          />
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-store-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            {t('common.save')}
          </button>
          {hasLimit && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-store-border px-3 py-1.5 text-xs text-store-text-2 hover:border-store-border-strong"
            >
              {t('common.cancel')}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-store-text">
              ${status.spentUsd.toFixed(2)}
              <span className="text-store-text-3"> / ${status.monthlyLimitUsd!.toFixed(2)}</span>
            </span>
            <span
              className={
                status.alertLevel === 'over'
                  ? 'text-store-red'
                  : status.alertLevel === 'warn'
                    ? 'text-store-amber'
                    : 'text-store-text-2'
              }
            >
              {status.fraction != null ? `${Math.round(status.fraction * 100)}%` : '—'}
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-store-panel-2">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className={status.projectedOverBudget ? 'text-store-amber' : 'text-store-text-2'}>
              {t('budget.projected')} ${status.projectedUsd.toFixed(2)}
            </span>
            {status.alertLevel !== 'none' && (
              <span
                className={`flex items-center gap-1 font-medium ${status.alertLevel === 'over' ? 'text-store-red' : 'text-store-amber'}`}
              >
                <AlertTriangle size={12} />
                {status.alertLevel === 'over' ? t('budget.overBudget') : t('budget.nearLimit')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
