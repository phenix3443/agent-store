import { expect, test } from 'bun:test'
import { safeNext } from '../safe-next'

test('keeps a path on this site, with its query and hash', () => {
  expect(safeNext('/store/skill/github:a/b/c')).toBe('/store/skill/github:a/b/c')
  expect(safeNext('/store?q=pdf&category=skill#x')).toBe('/store?q=pdf&category=skill#x')
})

test('refuses anything that leaves the site or loops through sign-in', () => {
  for (const raw of [
    null,
    '',
    'store',
    'https://evil.example/',
    '//evil.example/x',
    '/\\evil.example',
    '/\t/evil.example',
    'javascript:alert(1)',
    '/auth/login?provider=github',
    '/auth/callback',
    '/' + 'a'.repeat(2001),
  ]) {
    expect(safeNext(raw)).toBeNull()
  }
})
