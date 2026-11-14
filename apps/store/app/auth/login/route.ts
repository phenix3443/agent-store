import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { safeNext } from '@/lib/safe-next'

// Start a Better Auth social login. Kept as a GET route so the login
// modal's plain <a href="/auth/login?provider=…"> links keep working.
//
// Calls Better Auth in-process: fetching this site's own public URL from inside
// the pod fails, because request.url there carries the container's plain-HTTP
// address, not the public https origin.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const provider = params.get('provider') === 'google' ? 'google' : 'github'
  const next = safeNext(params.get('next'))
  const callbackURL = next ? `/auth/callback?next=${encodeURIComponent(next)}` : '/auth/callback'

  const res = await auth()
    .api.signInSocial({
      body: { provider, callbackURL },
      headers: request.headers,
      asResponse: true,
    })
    .catch(() => null)

  const data = res?.ok ? ((await res.json().catch(() => ({}))) as { url?: string }) : {}
  const failed = new URL('/?error=auth_failed', process.env.BETTER_AUTH_URL ?? request.url)
  if (!res || !data.url) return NextResponse.redirect(failed)

  const redirect = NextResponse.redirect(data.url)
  // The state cookie must reach the browser, or the callback rejects the login.
  for (const cookie of res.headers.getSetCookie()) redirect.headers.append('set-cookie', cookie)
  return redirect
}
