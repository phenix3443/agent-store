import { auth } from '@/lib/auth/server'

// Protect /dashboard behind a Neon Auth (Better Auth) session; unauthenticated
// visitors are redirected home (where the login modal lives). Session refresh
// for other routes happens through the same-origin /api/auth proxy on the client.
export default auth.middleware({ loginUrl: '/' })

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
}
