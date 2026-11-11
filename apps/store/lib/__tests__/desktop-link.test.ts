import { test, expect, afterEach } from 'bun:test'
import { desktopScheme, installLink, launchDesktop } from '../desktop-link'

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DESKTOP_SCHEME
})

test('the install link carries only slug and category', () => {
  expect(installLink({ slug: 'anki-mcp', category: 'mcp' })).toBe('agent-store://install?slug=anki-mcp&category=mcp')
  expect(installLink({ slug: 'superpowers', category: 'skill' })).toBe('agent-store://install?slug=superpowers&category=skill')
  expect(installLink({ slug: 'openrouter', category: 'provider' })).toBe('agent-store://install?slug=openrouter&category=provider')
})

test('the slug is percent-encoded', () => {
  expect(installLink({ slug: 'a b&c=d', category: 'skill' })).toBe('agent-store://install?slug=a%20b%26c%3Dd&category=skill')
})

test('NEXT_PUBLIC_DESKTOP_SCHEME overrides the scheme', () => {
  process.env.NEXT_PUBLIC_DESKTOP_SCHEME = 'agent-store-dev'
  expect(desktopScheme()).toBe('agent-store-dev')
  expect(installLink({ slug: 'anki-mcp', category: 'mcp' })).toBe('agent-store-dev://install?slug=anki-mcp&category=mcp')
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
