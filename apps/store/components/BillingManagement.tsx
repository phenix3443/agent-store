'use client'

import { useState } from 'react'
import { ReceiptText, Send, XCircle } from 'lucide-react'
import { StoreClient, type BillingState } from '@as/sdk'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

export function BillingManagement({ token, initialBilling }: { token: string; initialBilling: BillingState }) {
  const [billing, setBilling] = useState(initialBilling)
  const [mode, setMode] = useState<'idle' | 'cancel' | 'refund'>('idle')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const client = new StoreClient(API_URL)

  const isSubscription = billing.billingPeriod != null
  const canCancel = isSubscription && (billing.status === 'active' || billing.status === 'trialing')

  async function confirmCancellation() {
    setBusy(true)
    setError(null)
    const result = await client.cancelMySubscription(token)
    setBusy(false)
    if (!result.data) {
      setError(result.error)
      return
    }
    setBilling((current) => ({ ...current, status: result.data.status }))
    setMode('idle')
    setMessage('订阅将在当前计费周期结束后停止')
  }

  async function submitRefund(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('请填写退款原因')
      return
    }
    setBusy(true)
    setError(null)
    const result = await client.requestMyRefund(trimmed, token)
    setBusy(false)
    if (!result.data) {
      setError(result.error)
      return
    }
    setMode('idle')
    setReason('')
    setMessage('退款申请已提交审核')
  }

  return (
    <section className="mb-6 border-y border-store-border py-4" aria-labelledby="billing-management-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ReceiptText size={16} className="text-store-accent" aria-hidden="true" />
            <h2 id="billing-management-title" className="text-sm font-semibold text-store-text">账单管理</h2>
          </div>
          <p className="mt-1 text-xs text-store-text-3">
            {billing.billingPeriod ? `${billing.billingPeriod} 订阅` : '终身买断'}
            {billing.paidAmount && billing.currency ? ` · ${billing.currency} ${billing.paidAmount}` : ''}
            {` · ${billing.status}`}
          </p>
        </div>

        {mode === 'idle' && (
          <div className="flex flex-wrap gap-2">
            {canCancel && (
              <button type="button" onClick={() => { setMode('cancel'); setMessage(null) }} className="inline-flex items-center gap-1.5 rounded-lg border border-store-border-strong px-3 py-2 text-xs font-medium text-store-text-2 hover:border-store-red">
                <XCircle size={14} aria-hidden="true" />取消订阅
              </button>
            )}
            <button type="button" onClick={() => { setMode('refund'); setMessage(null) }} className="inline-flex items-center gap-1.5 rounded-lg border border-store-border-strong px-3 py-2 text-xs font-medium text-store-text-2 hover:border-store-accent">
              <ReceiptText size={14} aria-hidden="true" />申请退款
            </button>
          </div>
        )}
      </div>

      {mode === 'cancel' && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-store-border pt-4">
          <p className="mr-auto text-xs text-store-text-2">取消后，权益通常保留到当前计费周期结束。</p>
          <button type="button" onClick={() => setMode('idle')} className="rounded-lg px-3 py-2 text-xs text-store-text-2">返回</button>
          <button type="button" onClick={confirmCancellation} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-store-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            <XCircle size={14} aria-hidden="true" />{busy ? '处理中…' : '确认取消'}
          </button>
        </div>
      )}

      {mode === 'refund' && (
        <form onSubmit={submitRefund} className="mt-4 border-t border-store-border pt-4">
          <label htmlFor="refund-reason" className="text-xs font-medium text-store-text-2">退款原因</label>
          <textarea id="refund-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full resize-y rounded-lg border border-store-border-strong bg-store-panel px-3 py-2 text-sm text-store-text outline-none focus:border-store-accent" />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setMode('idle')} className="rounded-lg px-3 py-2 text-xs text-store-text-2">返回</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-store-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              <Send size={14} aria-hidden="true" />{busy ? '提交中…' : '提交退款申请'}
            </button>
          </div>
        </form>
      )}

      {message && <p className="mt-3 text-xs text-store-green" role="status">{message}</p>}
      {error && <p className="mt-3 text-xs text-store-red" role="alert">{error}</p>}
    </section>
  )
}
