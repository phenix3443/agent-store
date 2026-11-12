import { test, expect, afterEach } from 'bun:test'
import { desktopScheme, installLink, launchDesktop } from '../desktop-link'

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DESKTOP_SCHEME
})

test('the install link carries only slug, category and the resource id', () => {
  expect(installLink({ slug: 'openrouter', kind: 'provider', id: 'builtin:openrouter' })).toBe(
    'agent-store://install?slug=openrouter&category=provider&id=builtin%3Aopenrouter'
  )
  expect(installLink({ slug: 'skills-find-skills', kind: 'skill', id: 'github:vercel-labs/skills/find-skills' })).toBe(
    'agent-store://install?slug=skills-find-skills&category=skill&id=github%3Avercel-labs%2Fskills%2Ffind-skills'
  )
})

test('the slug is percent-encoded', () => {
  expect(installLink({ slug: 'a b&c=d', kind: 'skill', id: 'x' })).toBe('agent-store://install?slug=a%20b%26c%3Dd&category=skill&id=x')
})

test('NEXT_PUBLIC_DESKTOP_SCHEME overrides the scheme', () => {
  process.env.NEXT_PUBLIC_DESKTOP_SCHEME = 'agent-store-dev'
  expect(desktopScheme()).toBe('agent-store-dev')
  expect(installLink({ slug: 'anki-mcp', kind: 'mcp', id: 'm' })).toBe('agent-store-dev://install?slug=anki-mcp&category=mcp&id=m')
})

test('an empty or malformed scheme falls back to the default', () => {
  process.env.NEXT_PUBLIC_DESKTOP_SCHEME = ''
  expect(desktopScheme()).toBe('agent-store')
  process.env.NEXT_PUBLIC_DESKTOP_SCHEME = 'java script:'
  expect(desktopScheme()).toBe('agent-store')
})

test('losing focus right after the launch counts as opened', async () => {
  const pending = launchDesktop('agent-store://install?slug=x&category=skill', 200)
  expect(document.querySelectorAll('iframe').length).toBe(1)
  window.dispatchEvent(new Event('blur'))
  expect(await pending).toBe('opened')
  expect(document.querySelectorAll('iframe').length).toBe(0)
})

test('nothing happening within the window counts as missing', async () => {
  const started = Date.now()
  expect(await launchDesktop('agent-store://install?slug=x&category=skill', 60)).toBe('missing')
  expect(Date.now() - started).toBeGreaterThanOrEqual(50)
  expect(document.querySelectorAll('iframe').length).toBe(0)
})
