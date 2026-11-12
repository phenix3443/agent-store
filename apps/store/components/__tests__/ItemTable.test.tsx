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
  render(<ItemTable resources={rows} />)
  expect(screen.getByText('brainstorming')).toBeInTheDocument()
  expect(screen.getByText('Explore intent before building.')).toBeInTheDocument()
  expect(screen.getByText('obra')).toBeInTheDocument()
  expect(screen.getByText('GitHub · skills.sh')).toBeInTheDocument()
  expect(screen.getByText('MCP Registry')).toBeInTheDocument()
  expect(screen.getByText('内置')).toBeInTheDocument()
})

test('shows skills.sh installs where the data has them, and a dash, not a zero, where it does not', () => {
  const { container } = render(<ItemTable resources={rows} />)
  expect(screen.getAllByText('12.4K').length).toBeGreaterThan(0)
  expect(screen.getAllByText('没有安装量数据').length).toBeGreaterThan(0)
  expect(container.textContent).not.toMatch(/(^|\D)0(\D|$)/)
})

test('verified records carry the tick, others none', () => {
  const { container } = render(<ItemTable resources={rows} />)
  expect(container.querySelectorAll('[data-tier="verified"]').length).toBe(1)
})

test('the package name links to its detail page and marks the open one', () => {
  render(<ItemTable resources={rows} />)
  const link = screen.getByRole('link', { name: 'brainstorming' })
  expect(link.getAttribute('href')).toBe('/store/skill/github:obra/superpowers/brainstorming')
  expect(link.getAttribute('aria-current')).toBeNull()
  expect(screen.getByRole('link', { name: 'Anki MCP' }).getAttribute('aria-current')).toBe('true')
})

test('the install button is its own control, outside the link', () => {
  render(<ItemTable resources={rows} />)
  const button = screen.getByRole('button', { name: '在桌面客户端中安装 brainstorming' })
  expect(button.textContent).toBe('安装')
  expect(button.closest('a')).toBeNull()
})

test('the install column has a visible header', () => {
  render(<ItemTable resources={rows} />)
  expect(screen.getByRole('columnheader', { name: '安装' })).toBeInTheDocument()
})

test('there is no review column or verdict', () => {
  render(<ItemTable resources={rows} />)
  expect(screen.queryByRole('columnheader', { name: '审查' })).toBeNull()
  expect(screen.queryByText('待审')).toBeNull()
})
