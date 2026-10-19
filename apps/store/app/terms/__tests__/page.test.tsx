import { afterEach, expect, mock, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

let locale = 'zh'

mock.module('next-intl/server', () => ({
  getLocale: async () => locale,
}))
mock.module('next-intl', () => ({
  useLocale: () => locale,
}))

afterEach(() => cleanup())

const { default: TermsPage } = await import('../page')

async function renderTerms(nextLocale: string) {
  locale = nextLocale
  const view = render(await TermsPage())
  return view.container.textContent ?? ''
}

test('Chinese terms disclose all current products and billing behavior', async () => {
  const text = await renderTerms('zh')

  expect(screen.getByRole('article')).toHaveAttribute('lang', 'zh-CN')
  expect(text).toContain('USD 9.99')
  expect(text).toContain('USD 99.00')
  expect(text).toContain('USD 199.00')
  expect(text).toContain('14 天')
  expect(text).toContain('自动续费')
  expect(text).toContain('税费')
  expect(text).toContain('终身')
  expect(text).toContain('取消')
  expect(text).toContain('退款')
  expect(text).toContain('商户审核已通过')
  expect(text).toContain('测试模式')
  expect(text).not.toContain('生产商户审批')
  expect(screen.getByRole('link', { name: 'agent-store@panghuli.tech' })).toHaveAttribute(
    'href',
    'mailto:agent-store@panghuli.tech',
  )
})

test('English terms render alone for non-Chinese locales', async () => {
  const text = await renderTerms('en')

  expect(screen.getByRole('article')).toHaveAttribute('lang', 'en')
  expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
  expect(text).toContain('USD 9.99')
  expect(text).toContain('USD 99.00')
  expect(text).toContain('USD 199.00')
  expect(text).toContain('14-day')
  expect(text).toContain('automatically renew')
  expect(text).toContain('merchant review is complete')
  expect(text).toContain('test mode')
  expect(text).not.toContain('until merchant approval')
  expect(text).not.toContain('服务条款')
})

test('visible terms respond to a client locale change without a new server page', async () => {
  locale = 'zh'
  const view = render(await TermsPage())
  expect(screen.getByRole('heading', { level: 1, name: '服务条款' })).toBeInTheDocument()

  locale = 'en'
  view.rerender(await TermsPage())

  expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 1, name: '服务条款' })).not.toBeInTheDocument()
})
