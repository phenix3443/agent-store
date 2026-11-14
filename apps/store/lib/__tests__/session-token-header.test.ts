import { expect, test } from 'bun:test'
import { withoutSessionTokenHeader } from '../auth/session-token-header'

// The tests run on happy-dom's Response, which drops Set-Cookie the way a browser does, so the
// cookies the route must keep are not asserted here.

test('drops set-auth-token and its expose entry, keeps the other headers and the body', async () => {
  const headers = new Headers()
  headers.set('content-type', 'application/json')
  headers.set('set-auth-token', 'secret-session-token')
  headers.set('access-control-expose-headers', 'set-auth-jwt, set-auth-token')
  const res = withoutSessionTokenHeader(new Response('{"ok":true}', { status: 200, headers }))
  expect(res.headers.has('set-auth-token')).toBe(false)
  expect(res.headers.get('access-control-expose-headers')).toBe('set-auth-jwt')
  expect(res.headers.get('content-type')).toBe('application/json')
  expect(await res.text()).toBe('{"ok":true}')
})

test('removes the expose header when set-auth-token was the only entry', () => {
  const res = withoutSessionTokenHeader(
    new Response(null, { status: 302, headers: { 'set-auth-token': 't', 'access-control-expose-headers': 'set-auth-token', location: '/x' } })
  )
  expect(res.headers.has('access-control-expose-headers')).toBe(false)
  expect(res.status).toBe(302)
  expect(res.headers.get('location')).toBe('/x')
})

test('leaves a response without the header untouched', () => {
  const original = new Response('x', { headers: { 'content-type': 'text/plain' } })
  expect(withoutSessionTokenHeader(original)).toBe(original)
})
