import { afterEach, expect, mock, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

let locale = 'zh'

mock.module('next-intl/server', () => ({
  getLocale: async () => locale,
}))

afterEach(() => cleanup())

const { Footer } = await import('../Footer')

test('exposes legal and contact links from the shared footer', async () => {
  locale = 'zh'
  render(await Footer())

  expect(screen.getByRole('link', { name: '服务条款' })).toHaveAttribute('href', '/terms')
  expect(screen.getByRole('link', { name: '隐私政策' })).toHaveAttribute('href', '/privacy')
  expect(screen.getByRole('link', { name: 'agent-store@panghuli.tech' })).toHaveAttribute(
    'href',
    'mailto:agent-store@panghuli.tech',
  )
})

test('uses English labels outside the Chinese locale', async () => {
  locale = 'en'
  render(await Footer())

  expect(screen.getByRole('link', { name: 'Terms of Service' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument()
})
