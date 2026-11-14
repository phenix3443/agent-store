import { test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup, within } from '@testing-library/react'
import { intlMock, intlServerMock } from '../../../test-intl'
import zh from '../../../messages/zh.json'

mock.module('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => '/docs',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: () => {
    throw new Error('NEXT_REDIRECT')
  },
}))
mock.module('next-intl', () => intlMock)
mock.module('next-intl/server', () => intlServerMock)
afterEach(() => cleanup())

const { default: DocsPage } = await import('../page')
const { default: ArticlePage } = await import('../[article]/page')
const { ARTICLES, ABOUT_SECTION } = await import('../../../lib/docs')

test('every docs section belongs to exactly one place', () => {
  const placed = [ABOUT_SECTION, ...ARTICLES.flatMap((a) => a.sections)]
  expect(placed.sort()).toEqual(zh.site.docs.sections.map((s) => s.id).sort())
})

test('the index links one card per article', async () => {
  render(await DocsPage())
  const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
  for (const { id } of ARTICLES) expect(hrefs).toContain(`/docs/${id}`)
  expect(screen.getByRole('heading', { level: 2, name: '什么是 Agent Store' })).toBeTruthy()
})

test('an article has its sections, an on-page contents list and the next article', async () => {
  render(await ArticlePage({ params: Promise.resolve({ article: 'relay' }) }))
  expect(screen.getByRole('heading', { level: 1, name: '本地代理' })).toBeTruthy()
  const toc = screen.getByRole('navigation', { name: '本页目录' })
  expect(within(toc).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['#relay', '#levels', '#usage'])
  const nav = screen.getByRole('navigation', { name: '文档章节' })
  expect(within(nav).getByRole('link', { name: '本地代理' }).getAttribute('aria-current')).toBe('page')
  const pn = screen.getByRole('navigation', { name: '上一篇与下一篇' })
  expect(within(pn).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/docs/browse', '/docs/cli'])
  expect(screen.getByRole('button', { name: '复制: 本地代理' })).toBeTruthy()
})

test('prices are filled in', async () => {
  render(await ArticlePage({ params: Promise.resolve({ article: 'plans' }) }))
  const text = document.body.textContent ?? ''
  expect(text).toContain('$9.99')
  expect(text).not.toContain('{monthly}')
  expect(text).not.toContain('规划中')
})

test('an unknown article is a 404', async () => {
  await expect(ArticlePage({ params: Promise.resolve({ article: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
})
