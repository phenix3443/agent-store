'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { StoreClient } from '@as/sdk'
import { getAuthToken } from '@/lib/auth/token'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

interface UpgradeProButtonProps {
  className?: string
  children?: React.ReactNode
}

// Starts a Pro checkout (monthly) via the API server, binding the subscription
// to the signed-in user with their session token. On success redirects to the hosted checkout page.
export function UpgradeProButton({ className, children }: UpgradeProButtonProps) {
  const t = useTranslations('site.dashboard')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const token = await getAuthToken()
      if (!token) {
        setError(t('loginFirst'))
        return
      }
      const result = await new StoreClient(API_URL).createCheckout(
        { period: 'monthly' },
        { token },
      )
      if (result.error || !result.data) {
        setError(result.error ?? t('checkoutFailed'))
        return
      }
      window.location.href = result.data.checkoutUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : t('checkoutFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={className ?? 'btn min-h-12 px-5'}
      >
        {busy ? t('redirecting') : (children ?? t('upgrade'))}
      </button>
      {error && <span role="alert" className="text-[13px] text-danger">{error}</span>}
    </div>
  )
}
