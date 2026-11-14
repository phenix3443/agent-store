'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AuthStatus } from '@/components/AuthStatus'
import { authClient } from '@/lib/auth/client'
import { getAuthToken } from '@/lib/auth/token'

// Desktop (Tauri) OAuth relay. The provider can only redirect to an https URL, so
// the desktop app opens the system browser here instead:
//   1. `/auth/desktop?provider=github` → start Better Auth social sign-in, with
//      the callback pointing back at this same page.
//   2. the provider round-trip returns to `/auth/desktop` (no provider param) with
//      the session cookie already set → we mint a JWT and hand
//      it to the app via the `agent-store://auth-callback?token=…` deep link.
// When the browser session is still valid, step 1 skips the provider consent, so
// the app can silently refresh an expired token by reopening this page.
export default function DesktopAuthRelay() {
  const t = useTranslations('site.auth')
  const [status, setStatus] = useState<'working' | 'noToken' | 'returning'>('working')
  const [appUrl, setAppUrl] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const provider = params.get('provider')

    // Which custom scheme to deep-link back to. The desktop passes ?scheme= on the
    // first hop (dev builds use agent-store-dev, release uses agent-store); the
    // provider round-trip drops query params, so persist it in sessionStorage and
    // read it back on return. Allowlisted to prevent an arbitrary-scheme redirect.
    const SCHEMES = ['agent-store', 'agent-store-dev']
    function resolveScheme(): string {
      const fromParam = params.get('scheme')
      const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('desktop_auth_scheme') : null
      const s = fromParam ?? stored
      return s && SCHEMES.includes(s) ? s : 'agent-store'
    }

    async function run() {
      // Returning from the provider (or already signed in): mint a JWT and deep-link back.
      if (!provider) {
        const token = await getAuthToken()
        if (!token) {
          setStatus('noToken')
          return
        }
        const url = `${resolveScheme()}://auth-callback?token=${encodeURIComponent(token)}`
        setAppUrl(url)
        setStatus('returning')
        window.location.href = url
        return
      }
      // First hop: remember the target scheme across the provider round-trip, then
      // start social sign-in, returning to this page.
      try {
        sessionStorage.setItem('desktop_auth_scheme', resolveScheme())
      } catch {
        // sessionStorage unavailable — fall back to the default scheme on return.
      }
      const p = provider === 'google' ? 'google' : 'github'
      await authClient.signIn.social({ provider: p, callbackURL: '/auth/desktop' })
    }

    void run()
  }, [])

  return (
    <AuthStatus title={t(`desktop.${status}`)}>
      {status === 'noToken' && (
        <>
          <p className="text-fg-2">{t('desktop.noTokenHint')}</p>
          <Link href="/" className="link text-fg-2">
            {t('home')}
          </Link>
        </>
      )}
      {status === 'returning' && appUrl && (
        <>
          <p className="text-fg-2">{t('desktop.returningHint')}</p>
          <a href={appUrl} className="btn btn-primary">
            {t('desktop.openApp')}
          </a>
        </>
      )}
    </AuthStatus>
  )
}
