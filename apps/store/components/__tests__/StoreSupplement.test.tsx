import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { SearchSupplementResponse } from '@as/types'
import { intlMock } from '../../test-intl'
import { skillResource, summary } from './fixtures'

mock.module('next/link', () => ({
  default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => '/store',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: () => {
    throw new Error('NEXT_REDIRECT')
  },
}))
mock.module('next-intl', () => intlMock)

const answers: (SearchSupplementResponse | null)[] = []
const lookup = mock(async () => answers.shift() ?? null)
mock.module('@/app/store/actions', () => ({ lookupSupplement: lookup, loadMoreResources: async () => null }))

const { StoreSupplement } = await import('../StoreSupplement')

const base: SearchSupplementResponse = { status: 'none', reason: 'no_results', resources: [], listings: [], partial: false, retryAfterSeconds: null }
const query = { kind: null, q: 'pdf tools', sort: 'default' as const }

beforeEach(() => {
  lookup.mockClear()
  answers.length = 0
})
afterEach(() => { cleanup() })

test('nothing is sent before the visitor agrees, and the offer says where the query goes', () => {
  render(<StoreSupplement query={query} />)
  expect(screen.getByText('到其他技能目录里找找「pdf tools」')).toBeInTheDocument()
  expect(screen.getByText(/ClawHub、SkillHub、SkillsMP/)).toBeInTheDocument()
  expect(lookup).not.toHaveBeenCalled()
})

test('after agreeing it searches, then shows what other directories list', async () => {
  answers.push({
    ...base,
    status: 'found',
    resources: [summary(skillResource)],
    listings: [{ key: 'clawhub:x/pdf', site: 'clawhub', name: 'pdf-kit', description: 'Edit PDFs', author: 'x', url: 'https://clawhub.ai/x/pdf' }],
    partial: true,
  })
  render(<StoreSupplement query={query} />)
  fireEvent.click(screen.getByRole('button', { name: '发送并查找' }))
  expect(screen.getByText('正在其他技能目录里查找…')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('其他技能目录里的结果')).toBeInTheDocument())
  expect(lookup).toHaveBeenCalledWith(query)
  expect(screen.getByRole('link', { name: 'brainstorming' }).getAttribute('href')).toBe('/store/skill/github:obra/superpowers/brainstorming')
  const away = screen.getByRole('link', { name: '在 ClawHub 查看' })
  expect(away.getAttribute('href')).toBe('https://clawhub.ai/x/pdf')
  expect(away.getAttribute('rel')).toContain('noopener')
  expect(screen.getByText('有的站点没有响应，结果可能不全。')).toBeInTheDocument()
})

test('a lookup still running is asked again', async () => {
  answers.push({ ...base, status: 'searching', retryAfterSeconds: 0 }, { ...base, status: 'none' })
  render(<StoreSupplement query={query} />)
  fireEvent.click(screen.getByRole('button', { name: '发送并查找' }))
  await waitFor(() => expect(screen.getByText('其他技能目录里也没有找到「pdf tools」。')).toBeInTheDocument())
  expect(lookup).toHaveBeenCalledTimes(2)
})

test('no answer from the API, or "unavailable", offers a retry', async () => {
  answers.push(null, { ...base, status: 'none' })
  render(<StoreSupplement query={query} />)
  fireEvent.click(screen.getByRole('button', { name: '发送并查找' }))
  await waitFor(() => expect(screen.getByText('暂时没法查询其他技能目录。')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await waitFor(() => expect(screen.getByText('其他技能目录里也没有找到「pdf tools」。')).toBeInTheDocument())
})

test('"disabled" or "not_needed" removes the block', async () => {
  for (const status of ['disabled', 'not_needed'] as const) {
    answers.push({ ...base, status, reason: null })
    const { container } = render(<StoreSupplement query={query} />)
    fireEvent.click(screen.getByRole('button', { name: '发送并查找' }))
    await waitFor(() => expect(container.querySelector('[data-supplement]')).toBeNull())
    cleanup()
  }
})
