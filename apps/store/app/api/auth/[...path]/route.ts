import { auth } from '@/lib/auth/server'

// Same-domain proxy for the Neon Auth (Better Auth) server. All client auth
// calls go to /api/auth/* on this origin; the handler forwards them to the
// remote Neon Auth endpoint and manages the session cookie on our domain.
export const { GET, POST } = auth.handler()
