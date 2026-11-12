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
const { SearchInput } = await import('../SearchInput')

test('category filter shows every category, without counts the paged API cannot give', () => {
  render(<CategoryFilter active="all" />)
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['全部', '技能', 'MCP', '供应商'])
})

test('category filter is a pressed-button group, not tabs', () => {
  render(<CategoryFilter active="skill" />)
  expect(screen.getByRole('group', { name: '类别' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '技能' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: '全部' }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.queryByRole('tab')).toBeNull()
})

test('choosing a category replaces the URL and keeps the other params', () => {
  search = 'q=anki'
  render(<CategoryFilter active="all" />)
  fireEvent.click(screen.getByRole('button', { name: 'MCP' }))
  expect(replace).toHaveBeenCalledWith('/store?q=anki&category=mcp', { scroll: false })
  expect(push).not.toHaveBeenCalled()
})

test('sort offers the five orders the catalog API supports', () => {
  render(<SortSelect active="default" />)
  const options = screen.getAllByRole('option').map((o) => o.textContent)
  expect(options).toEqual(['推荐', '最多安装', '最多星标', '最近更新', '名称'])
})

test('selecting a sort writes ?sort= to the URL; the default leaves it out', () => {
  search = 'sort=name'
  render(<SortSelect active="name" />)
  fireEvent.change(screen.getByLabelText('排序'), { target: { value: 'installs' } })
  expect(replace).toHaveBeenLastCalledWith('/store?sort=installs', { scroll: false })
  fireEvent.change(screen.getByLabelText('排序'), { target: { value: 'default' } })
  expect(replace).toHaveBeenLastCalledWith('/store', { scroll: false })
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
