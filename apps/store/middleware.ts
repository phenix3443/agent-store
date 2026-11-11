import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

// Send signed-out visitors of /dashboard home (where the login modal lives).
// Only checks that a session cookie exists; the page itself validates the
// session against the database, so a forged cookie gets no further than here.
export default function middleware(request: NextRequest) {
  if (!getSessionCookie(request)) return NextResponse.redirect(new URL('/', request.url))
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
}
