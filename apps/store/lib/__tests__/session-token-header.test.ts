import { afterAll, beforeAll, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { withoutSessionTokenHeader } from '../auth/session-token-header'

// happy-dom's Response drops Set-Cookie like a browser does; the route runs on the server's Fetch API.
beforeAll(() => GlobalRegistrator.unregister())
afterAll(() => GlobalRegistrator.register({ url: 'http://localhost/' }))

test('drops set-auth-token and its expose entry, keeps cookies and the body', async () => {
  const headers = new Headers()
  headers.append('set-cookie', 'a=1; Path=/')
  headers.append('set-cookie', 'b=2; Path=/')
  headers.set('set-auth-token', 'secret-session-token')
  headers.set('access-control-expose-headers', 'set-auth-jwt, set-auth-token')
  const res = withoutSessionTokenHeader(new Response('{"ok":true}', { status: 200, headers }))
  expect(res.headers.has('set-auth-token')).toBe(false)
  expect(res.headers.get('access-control-expose-headers')).toBe('set-auth-jwt')
  expect(res.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/'])
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
