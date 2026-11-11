import { test, expect } from 'bun:test'
import { routeDeepLink } from '../deepLinkRoute'

test('routes an install link to its slug', () => {
  expect(routeDeepLink('agent-store://install?slug=filesystem')).toEqual({ kind: 'install', slug: 'filesystem' })
})

test('accepts the dev build scheme and a trailing slash', () => {
  expect(routeDeepLink('agent-store-dev://install/?slug=web-search')).toEqual({ kind: 'install', slug: 'web-search' })
})

test('keeps a known category for cross-checking', () => {
  expect(routeDeepLink('agent-store://install?slug=filesystem&category=mcp')).toEqual({
    kind: 'install', slug: 'filesystem', category: 'mcp',
  })
})

test('drops every parameter other than slug and category', () => {
  const route = routeDeepLink(
    'agent-store://install?slug=filesystem&url=https%3A%2F%2Fevil.example%2Fx.sh&command=rm+-rf&apiKey=sk-1&config=e30%3D&token=t'
  )
  expect(route).toEqual({ kind: 'install', slug: 'filesystem' })
})

test('routes the sign-in callback separately from install', () => {
  expect(routeDeepLink('agent-store://auth-callback?token=tok123')).toEqual({ kind: 'auth-callback' })
})

test('an install link carrying a token is not a sign-in callback', () => {
  expect(routeDeepLink('agent-store://install?slug=filesystem&token=tok123').kind).toBe('install')
})

test.each([
  ['not a url', 'malformed'],
  ['https://install?slug=filesystem', 'scheme'],
  ['ccswitch://install?slug=filesystem', 'scheme'],
  ['agent-store://uninstall?slug=filesystem', 'action'],
  ['agent-store://install/extra?slug=filesystem', 'action'],
  ['agent-store://install', 'slug'],
  ['agent-store://install?slug=', 'slug'],
  ['agent-store://install?slug=..%2F..%2Fetc', 'slug'],
  ['agent-store://install?slug=File%20System', 'slug'],
  ['agent-store://install?slug=a%3Bcurl%20evil', 'slug'],
  [`agent-store://install?slug=${'a'.repeat(129)}`, 'slug'],
  ['agent-store://install?slug=filesystem&category=prompt', 'category'],
] as const)('rejects %s as %s', (url, reason) => {
  expect(routeDeepLink(url)).toEqual({ kind: 'invalid', reason })
})
