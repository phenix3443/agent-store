import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { I18nProvider, useT, detectLocale } from '../index'

afterEach(() => {
  cleanup()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})

function Probe() {
  const t = useT()
  return <span>{t('nav.settings')}</span>
}

test('detectLocale maps a regional browser locale to a supported base locale', () => {
  expect(detectLocale(['en-GB'])).toBe('en')
  expect(detectLocale(['es-419', 'en-US'])).toBe('en')
  expect(detectLocale(['zh-TW'])).toBe('zh')
})

test('detectLocale falls back to Chinese for an unsupported locale', () => {
  expect(detectLocale(['fr-FR', 'de'])).toBe('zh')
  expect(detectLocale(['ja', 'ko-KR'])).toBe('zh')
})

test('a stored locale choice is honored on mount', () => {
  localStorage.setItem('as-locale', 'en')
  render(
    <I18nProvider>
      <Probe />
    </I18nProvider>
  )
  expect(screen.getByText('Settings')).toBeInTheDocument()
})

// #95: Japanese, Korean and Spanish were dropped; people who picked one get English.
for (const dropped of ['ja', 'ko', 'es']) {
  test(`a stored ${dropped} preference is read as English`, () => {
    localStorage.setItem('as-locale', dropped)
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    )
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
}

test('an unknown stored value falls back to the detected locale', () => {
  localStorage.setItem('as-locale', 'fr')
  render(
    <I18nProvider>
      <Probe />
    </I18nProvider>
  )
  expect(screen.getByText(detectLocale() === 'en' ? 'Settings' : '设置')).toBeInTheDocument()
})

function keyPaths(dict: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(dict).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]
  )
}

test('Chinese and English carry the same keys', async () => {
  const { messages } = await import('../messages')
  expect(keyPaths(messages.en).sort()).toEqual(keyPaths(messages.zh).sort())
})
