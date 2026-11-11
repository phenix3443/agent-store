import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'

// Sign out in-process (see auth/login/route.ts for why not over HTTP), forward
// the cookie-clearing Set-Cookie headers to the browser and return home.
export async function GET(request: Request) {
  const res = await auth()
    .api.signOut({ headers: request.headers, asResponse: true })
    .catch(() => null)

  const redirect = NextResponse.redirect(new URL('/', process.env.BETTER_AUTH_URL ?? request.url))
  for (const cookie of res?.headers.getSetCookie() ?? []) redirect.headers.append('set-cookie', cookie)
  return redirect
}
