'use client'

import { createAuthClient } from '@neondatabase/auth/next'

// Browser Neon Auth (Better Auth) client. No args = same-origin: it talks to
// this app's /api/auth/* proxy, so the session cookie lives on our domain.
export const authClient = createAuthClient()
