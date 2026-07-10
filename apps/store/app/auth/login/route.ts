import { NextResponse } from 'next/server'

// Start a Neon Auth (Better Auth) social login. Kept as a GET route so the login
// modal's plain <a href="/auth/login?provider=…"> links keep working. Forwards
// to the same-origin proxy's sign-in/social, then redirects the browser to the
// provider, carrying the state cookie the proxy set.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const provider = url.searchParams.get('provider') === 'google' ? 'google' : 'github'
  const origin = url.origin

  const res = await fetch(`${origin}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      cookie: request.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({ provider, callbackURL: '/auth/callback' }),
  })

  const data = (await res.json().catch(() => ({}))) as { url?: string }
  if (!data.url) return NextResponse.redirect(new URL('/?error=auth_failed', request.url))

  const redirect = NextResponse.redirect(data.url)
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) redirect.headers.set('set-cookie', setCookie)
  return redirect
}
