import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { intlMock } from '../../test-intl'

const replace = mock(() => {})
const push = mock(() => {})
let search = ''
mock.module('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => '/store',
  useSearchParams: () => new URLSearchParams(search),
  // bun shares module mocks between files, so every mock exposes what any page imports.
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
mock.module('next-intl', () => intlMock)

beforeEach(() => {
  replace.mockClear()
  push.mockClear()
  search = ''
})
afterEach(() => { cleanup() })

const { CategoryFilter } = await import('../CategoryFilter')
const { SortSelect } = await import('../SortSelect')
const { VerifiedToggle } = await import('../VerifiedToggle')
const { SearchInput } = await import('../SearchInput')

const counts = { all: 24, skill: 12, mcp: 9, provider: 3 }

test('category filter shows every category with its count', () => {
  render(<CategoryFilter active="all" counts={counts} />)
  expect(screen.getByRole('button', { name: '全部 24' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '技能 12' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'MCP 9' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '供应商 3' })).toBeInTheDocument()
})

test('category filter is a pressed-button group, not tabs', () => {
  render(<CategoryFilter active="skill" counts={counts} />)
  expect(screen.getByRole('group', { name: '类别' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '技能 12' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: '全部 24' }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.queryByRole('tab')).toBeNull()
})

test('choosing a category replaces the URL and keeps the other params', () => {
  search = 'q=anki'
  render(<CategoryFilter active="all" counts={counts} />)
  fireEvent.click(screen.getByRole('button', { name: 'MCP 9' }))
  expect(replace).toHaveBeenCalledWith('/store?q=anki&category=mcp', { scroll: false })
  expect(push).not.toHaveBeenCalled()
})

test('sort offers three distinct options and no duplicate "all"', () => {
  render(<SortSelect active="downloads" />)
  const options = screen.getAllByRole('option').map((o) => o.textContent)
  expect(options).toEqual(['最多安装', '最近新增', '评分最高'])
})

test('selecting a sort writes ?sort= to the URL', () => {
  render(<SortSelect active="downloads" />)
  fireEvent.change(screen.getByLabelText('排序'), { target: { value: 'rating' } })
  expect(replace).toHaveBeenCalledWith('/store?sort=rating', { scroll: false })
})

test('verified switch reflects and toggles the filter', () => {
  render(<VerifiedToggle active={false} />)
  const toggle = screen.getByRole('switch', { name: '只看已验证' })
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(toggle)
  expect(replace).toHaveBeenCalledWith('/store?verified=1', { scroll: false })
})

test('search is debounced and replaces instead of pushing history', async () => {
  render(<SearchInput />)
  const input = screen.getByRole('searchbox', { name: '搜索' })
  fireEvent.change(input, { target: { value: 'a' } })
  fireEvent.change(input, { target: { value: 'an' } })
  fireEvent.change(input, { target: { value: 'anki' } })
  expect(replace).not.toHaveBeenCalled()
  await waitFor(() => expect(replace).toHaveBeenCalledTimes(1))
  expect(replace).toHaveBeenCalledWith('/store?q=anki', { scroll: false })
  expect(push).not.toHaveBeenCalled()
})

test('"/" focuses the search box', () => {
  render(<SearchInput />)
  const input = screen.getByRole('searchbox', { name: '搜索' })
  expect(document.activeElement).not.toBe(input)
  fireEvent.keyDown(window, { key: '/' })
  expect(document.activeElement).toBe(input)
})
