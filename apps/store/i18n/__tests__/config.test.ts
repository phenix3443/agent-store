import { expect, test } from 'bun:test'
import { resolveLocale } from '../config'

test('supported locales pass through', () => {
  expect(resolveLocale('zh')).toBe('zh')
  expect(resolveLocale('en')).toBe('en')
})

test('cookies for retired locales fall back to English, anything else to Chinese', () => {
  for (const code of ['ja', 'ko', 'es']) expect(resolveLocale(code)).toBe('en')
  expect(resolveLocale(undefined)).toBe('zh')
  expect(resolveLocale('fr')).toBe('zh')
})
