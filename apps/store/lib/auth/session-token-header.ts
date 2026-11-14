// The bearer plugin copies the session token into a `set-auth-token` header on
// every response that sets the session cookie, which page script could read on
// a getSession refresh. The desktop client takes its token from the
// /device/token body, so no response needs that header.
export function withoutSessionTokenHeader(res: Response): Response {
  if (!res.headers.has('set-auth-token')) return res
  const headers = new Headers(res.headers)
  headers.delete('set-auth-token')
  const exposed = headers
    .get('access-control-expose-headers')
    ?.split(',')
    .map((h) => h.trim())
    .filter((h) => h && h.toLowerCase() !== 'set-auth-token')
  if (exposed?.length) headers.set('access-control-expose-headers', exposed.join(', '))
  else headers.delete('access-control-expose-headers')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}
