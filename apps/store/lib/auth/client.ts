'use client'

import { createAuthClient } from 'better-auth/react'

// Browser Better Auth client. No baseURL = same origin: it talks to this app's
// /api/auth/* route, so the session cookie lives on our domain.
export const authClient = createAuthClient()
