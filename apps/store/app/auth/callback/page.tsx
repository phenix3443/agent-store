'use client'

import { useEffect } from 'react'
import { authClient } from '@/lib/auth/client'

// OAuth landing page. Better Auth has already set the session cookie on its
// /api/auth/callback/* hop before redirecting here. We then do a FULL
// page navigation (not a client-side router push) so the root layout re-renders
// server-side with the new cookie and the nav reflects the signed-in user.
export default function AuthCallback() {
  useEffect(() => {
    authClient
      .getSession()
      .catch(() => undefined)
      .finally(() => {
        window.location.href = '/dashboard'
      })
  }, [])

  return (
    <main style={{ padding: 40, fontFamily: 'system-ui', color: 'var(--text-2, #888)' }}>正在登录…</main>
  )
}
