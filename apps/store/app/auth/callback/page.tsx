'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth/client'

// OAuth landing page. The provider round-trip returns here with a
// ?neon_auth_session_verifier=… token; the Neon Auth client consumes it (via
// getSession) to establish the same-origin session cookie, then we continue to
// the dashboard.
export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    let done = false
    authClient
      .getSession()
      .catch(() => undefined)
      .finally(() => {
        if (!done) router.replace('/dashboard')
      })
    return () => {
      done = true
    }
  }, [router])

  return (
    <main style={{ padding: 40, fontFamily: 'system-ui', color: 'var(--text-2, #888)' }}>正在登录…</main>
  )
}
