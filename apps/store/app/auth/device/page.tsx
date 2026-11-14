'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AuthStatus } from '@/components/AuthStatus'
import { authClient } from '@/lib/auth/client'
import { formatUserCode } from '@/lib/auth/user-code'

// Approval page of the desktop sign-in (device authorization grant, #195). The
// client opens /auth/device?user_code=…&provider=…, shows the same code, and polls
// /api/auth/device/token until the code is approved here. Approval always takes a
// click: a verification link can be sent to someone else (RFC 8628 §5.4).

type Status =
  | 'loading'
  | 'signIn'
  | 'confirm'
  | 'working'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'used'
  | 'otherAccount'
  | 'invalid'
  | 'failed'

const USER_CODE = /^[A-Za-z0-9-]{4,32}$/

type DeviceError = { error?: string; status?: number } | null

function statusOfError(error: DeviceError): Status {
  if (error?.error === 'expired_token') return 'expired'
  if (error?.error === 'invalid_request') return 'invalid'
  if (error?.error === 'access_denied' || error?.status === 403) return 'otherAccount'
  return 'failed'
}

export default function DesktopDeviceApproval() {
  const t = useTranslations('site.auth.device')
  const [status, setStatus] = useState<Status>('loading')
  const [code, setCode] = useState('')
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const userCode = params.get('user_code') ?? ''
    if (!USER_CODE.test(userCode)) {
      setStatus('invalid')
      return
    }
    setCode(userCode)

    async function run() {
      const session = await authClient.getSession().catch(() => null)
      const user = session?.data?.user
      if (!user) {
        const provider = params.get('provider')
        if (provider === 'github' || provider === 'google') {
          await signIn(provider, userCode)
          return
        }
        setStatus('signIn')
        return
      }
      setEmail(user.email ?? null)
      // Reading the code while signed in ties it to this account; only then can it be approved.
      const res = await authClient.$fetch<{ status?: string; client_id?: string }>('/device', {
        method: 'GET',
        query: { user_code: userCode },
      })
      if (res.error) {
        setStatus(statusOfError(res.error as unknown as DeviceError))
        return
      }
      if (res.data?.status !== 'pending') setStatus('used')
      else if (!res.data.client_id) setStatus('otherAccount')
      else setStatus('confirm')
    }

    void run().catch(() => setStatus('failed'))
  }, [])

  async function signIn(provider: 'github' | 'google', userCode = code) {
    setStatus('working')
    const res = await authClient.signIn
      .social({ provider, callbackURL: `/auth/device?user_code=${encodeURIComponent(userCode)}` })
      .catch(() => null)
    if (!res || res.error) setStatus('failed')
  }

  async function decide(approve: boolean) {
    setStatus('working')
    const res = await authClient
      .$fetch(approve ? '/device/approve' : '/device/deny', { method: 'POST', body: { userCode: code } })
      .catch(() => null)
    if (!res) setStatus('failed')
    else if (res.error) setStatus(statusOfError(res.error as unknown as DeviceError))
    else setStatus(approve ? 'approved' : 'denied')
  }

  return (
    <AuthStatus title={t(`${status}.title`)}>
      {status === 'signIn' && (
        <>
          <p className="text-fg-2">{t('signIn.body')}</p>
          <div className="grid w-full max-w-xs gap-2.5">
            <button type="button" className="btn btn-primary w-full" onClick={() => void signIn('github')}>
              {t('signIn.github')}
            </button>
            <button type="button" className="btn min-h-11 w-full" onClick={() => void signIn('google')}>
              {t('signIn.google')}
            </button>
          </div>
        </>
      )}
      {status === 'confirm' && (
        <>
          <p className="text-fg-2">{t('confirm.body', { email: email ?? '' })}</p>
          <p className="font-mono text-[28px] font-bold tracking-[0.14em]" aria-label={t('confirm.codeLabel')}>
            {formatUserCode(code)}
          </p>
          <p className="text-[14px] text-fg-3">{t('confirm.check')}</p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <button type="button" className="btn btn-primary" onClick={() => void decide(true)}>
              {t('confirm.allow')}
            </button>
            <button type="button" className="btn" onClick={() => void decide(false)}>
              {t('confirm.deny')}
            </button>
          </div>
        </>
      )}
      {['approved', 'denied', 'expired', 'used', 'otherAccount', 'invalid', 'failed'].includes(status) && (
        <>
          <p className="text-fg-2">{t(`${status}.body`)}</p>
          <Link href="/" className="link text-fg-2">
            {t('home')}
          </Link>
        </>
      )}
    </AuthStatus>
  )
}
