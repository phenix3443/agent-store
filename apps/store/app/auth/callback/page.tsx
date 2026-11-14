'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { authClient } from '@/lib/auth/client'
import { AuthStatus } from '@/components/AuthStatus'

// OAuth landing page. Better Auth has already set the session cookie on its
// /api/auth/callback/* hop before redirecting here. We then do a FULL
// page navigation (not a client-side router push) so the root layout re-renders
// server-side with the new cookie and the nav reflects the signed-in user.
export default function AuthCallback() {
  const t = useTranslations('site.auth')
  useEffect(() => {
    authClient
      .getSession()
      .catch(() => undefined)
      .finally(() => {
        window.location.href = '/dashboard'
      })
  }, [])

  return <AuthStatus title={t('signingIn')} />
}
