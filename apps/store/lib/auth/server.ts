import { createNeonAuth } from '@neondatabase/auth/next/server'
import { neonAuthConfig } from './config'

// Server-side Neon Auth (managed Better Auth) instance. Exposes the same-domain
// proxy `.handler()`, route-protecting `.middleware()`, and server session
// helpers (getSession / getAccessToken). Note: the standalone authApiHandler /
// neonAuthMiddleware exports are types-only in this SDK build — go through the
// instance methods.
export const auth = createNeonAuth(neonAuthConfig)
