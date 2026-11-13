import { test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { intlMock } from '../../test-intl'
import { mcpResource, providerResource, skillResource, summary } from './fixtures'

mock.module('next/link', () => ({
  default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => '/store/mcp/mcp-registry:io.github.ankimcp/anki-mcp-server',
  useSearchParams: () => new URLSearchParams(),
  // bun shares module mocks between files, so every mock exposes what any page imports.
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: () => {
    throw new Error('NEXT_REDIRECT')
  },
}))
mock.module('next-intl', () => intlMock)

afterEach(() => { cleanup() })

const { ItemTable } = await import('../ItemTable')

const rows = [summary(skillResource), summary(mcpResource), summary(providerResource)]

test('renders name, the lead sentence of the description, author and source', () => {
  render(<ItemTable resources={rows} showCategory />)
  expect(screen.getByText('brainstorming')).toBeInTheDocument()
  expect(screen.getByText('Explore intent before building.')).toBeInTheDocument()
  expect(screen.getByText('obra')).toBeInTheDocument()
  expect(screen.getByText('GitHub · skills.sh')).toBeInTheDocument()
  expect(screen.getByText('MCP Registry')).toBeInTheDocument()
  expect(screen.getByText('内置')).toBeInTheDocument()
})

test('shows skills.sh installs where the data has them, and a dash, not a zero, where it does not', () => {
  const { container } = render(<ItemTable resources={rows} showCategory />)
  expect(screen.getAllByText('12.4K').length).toBeGreaterThan(0)
  expect(screen.getAllByText('没有安装量数据').length).toBeGreaterThan(0)
  expect(container.textContent).not.toMatch(/(^|\D)0(\D|$)/)
})

test('shows GitHub stars under the installs where the catalog has them, and nothing where it does not', () => {
  render(<ItemTable resources={rows} showCategory />)
  expect(screen.getAllByText('★ 152.3K').length).toBeGreaterThan(0)
  expect(screen.getAllByText('★ 1.3K').length).toBeGreaterThan(0)
  expect(screen.getAllByText('GitHub 星标 152.3K').length).toBeGreaterThan(0)
  expect(screen.getAllByText(/★/).length).toBe(4)
})

test('verified records carry the tick, others none', () => {
  const { container } = render(<ItemTable resources={rows} showCategory />)
  expect(container.querySelectorAll('[data-tier="verified"]').length).toBe(1)
})

test('the package name links to its detail page and marks the open one', () => {
  render(<ItemTable resources={rows} showCategory />)
  const link = screen.getByRole('link', { name: 'brainstorming' })
  expect(link.getAttribute('href')).toBe('/store/skill/github:obra/superpowers/brainstorming')
  expect(link.getAttribute('aria-current')).toBeNull()
  expect(screen.getByRole('link', { name: 'Anki MCP' }).getAttribute('aria-current')).toBe('true')
})

test('the install button is its own control, outside the link', () => {
  render(<ItemTable resources={rows} showCategory />)
  const button = screen.getByRole('button', { name: '在桌面客户端中安装 brainstorming' })
  expect(button.textContent).toBe('安装')
  expect(button.closest('a')).toBeNull()
})

test('the install column has a visible header', () => {
  render(<ItemTable resources={rows} showCategory />)
  expect(screen.getByRole('columnheader', { name: '安装' })).toBeInTheDocument()
})

test('there is no review column or verdict', () => {
  render(<ItemTable resources={rows} showCategory />)
  expect(screen.queryByRole('columnheader', { name: '审查' })).toBeNull()
  expect(screen.queryByText('待审')).toBeNull()
})

test('the All tab shows the category column: a header and a label on every row', () => {
  render(<ItemTable resources={rows} showCategory />)
  expect(screen.getByRole('columnheader', { name: '类别' })).toBeInTheDocument()
  expect(screen.getAllByRole('columnheader').length).toBe(5)
  for (const row of screen.getAllByRole('row').slice(1)) expect(row.querySelectorAll('[role="cell"]').length).toBe(5)
  expect(screen.getByRole('cell', { name: '技能' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: 'MCP' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: '供应商' })).toBeInTheDocument()
})

test('a single-kind tab drops the category header and labels, and header and rows share one grid', () => {
  render(<ItemTable resources={[summary(skillResource)]} showCategory={false} />)
  expect(screen.queryByRole('columnheader', { name: '类别' })).toBeNull()
  expect(screen.getAllByRole('columnheader').length).toBe(4)
  expect(screen.queryByRole('cell', { name: '技能' })).toBeNull()
  const [header, row] = screen.getAllByRole('row')
  expect(row?.querySelectorAll('[role="cell"]').length).toBe(4)
  const grid = (el: Element | undefined) => el?.className.match(/md:grid-cols-\[[^\]]+\]/)?.[0]
  expect(grid(header)).toBe('md:grid-cols-[minmax(0,1fr)_168px_72px_92px]')
  expect(grid(row)).toBe(grid(header))
})
