import { test, expect } from 'bun:test'
import { routeDeepLink } from '../deepLinkRoute'

test('routes an install link to its slug', () => {
  expect(routeDeepLink('agent-store://install?slug=filesystem')).toEqual({ kind: 'install', ref: 'filesystem', slug: 'filesystem' })
})

test('accepts the dev build scheme and a trailing slash', () => {
  expect(routeDeepLink('agent-store-dev://install/?slug=web-search')).toEqual({ kind: 'install', ref: 'web-search', slug: 'web-search' })
})

test('keeps a known category for cross-checking', () => {
  expect(routeDeepLink('agent-store://install?slug=filesystem&category=mcp')).toEqual({
    kind: 'install', ref: 'filesystem', slug: 'filesystem', category: 'mcp',
  })
})

test('drops every parameter other than slug and category', () => {
  const route = routeDeepLink(
    'agent-store://install?slug=filesystem&url=https%3A%2F%2Fevil.example%2Fx.sh&command=rm+-rf&apiKey=sk-1&config=e30%3D&token=t'
  )
  expect(route).toEqual({ kind: 'install', ref: 'filesystem', slug: 'filesystem' })
})

test('a web store link installs by its catalog id; the slug is kept only for display', () => {
  expect(routeDeepLink('agent-store://install?slug=skills-find-skills&category=skill&id=github%3Avercel-labs%2Fskills%2Ffind-skills')).toEqual({
    kind: 'install', ref: 'github:vercel-labs/skills/find-skills', slug: 'skills-find-skills', category: 'skill',
  })
  expect(routeDeepLink('agent-store://install?id=mcp-registry%3Aio.github.upstash%2Fcontext7')).toEqual({
    kind: 'install', ref: 'mcp-registry:io.github.upstash/context7',
  })
})

test('an id that is not a catalog id is refused, even next to a good slug', () => {
  for (const id of ['evil:x', 'github:a b', 'builtin:', `github:${'a'.repeat(301)}`, 'github:x%0Ay']) {
    expect(routeDeepLink(`agent-store://install?slug=ok&id=${encodeURIComponent(id)}`)).toEqual({ kind: 'invalid', reason: 'slug' })
  }
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
