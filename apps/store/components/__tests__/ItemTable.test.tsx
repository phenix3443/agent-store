import { test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { intlMock } from '../../test-intl'
import { mcpItem, providerItem } from './fixtures'

mock.module('next/link', () => ({
  default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => '/store/mcp/anki-mcp',
  useSearchParams: () => new URLSearchParams(),
  // bun shares module mocks between files, so every mock exposes what any page imports.
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
mock.module('next-intl', () => intlMock)

afterEach(() => { cleanup() })

const { ItemTable } = await import('../ItemTable')

test('renders name, description and publisher', () => {
  render(<ItemTable items={[providerItem]} />)
  expect(screen.getByText('OpenAI Provider')).toBeInTheDocument()
  expect(screen.getByText('OpenAI API provider with GPT-4o support')).toBeInTheDocument()
  expect(screen.getByText('OpenAI')).toBeInTheDocument()
  expect(screen.getByText('官方')).toBeInTheDocument()
})

test('the store list truncates descriptions; the landing page shows them whole', () => {
  const { unmount } = render(<ItemTable items={[providerItem]} />)
  expect(screen.getByText('OpenAI API provider with GPT-4o support')).toHaveClass('truncate')
  unmount()
  render(<ItemTable items={[providerItem]} wrapDescriptions />)
  expect(screen.getByText('OpenAI API provider with GPT-4o support')).not.toHaveClass('truncate')
})

test('formats install counts: 1.2M, 999, 1.5K', () => {
  render(
    <ItemTable
      items={[providerItem, { ...providerItem, id: 'b', slug: 'b', downloads: 999 }, { ...providerItem, id: 'c', slug: 'c', downloads: 1500 }]}
    />
  )
  expect(screen.getAllByText('1.2M').length).toBeGreaterThan(0)
  expect(screen.getAllByText('999').length).toBeGreaterThan(0)
  expect(screen.getAllByText('1.5K').length).toBeGreaterThan(0)
})

test('the package name links to its detail page and marks the open one', () => {
  render(<ItemTable items={[providerItem, mcpItem]} />)
  const link = screen.getByRole('link', { name: 'OpenAI Provider' })
  expect(link.getAttribute('href')).toBe('/store/provider/openai-provider')
  expect(link.getAttribute('aria-current')).toBeNull()
  expect(screen.getByRole('link', { name: 'Anki MCP' }).getAttribute('aria-current')).toBe('true')
})

test('the install button is its own control, outside the link', () => {
  render(<ItemTable items={[providerItem]} />)
  const button = screen.getByRole('button', { name: '在桌面客户端中安装 OpenAI Provider' })
  expect(button.textContent).toBe('安装')
  expect(button.closest('a')).toBeNull()
})

test('the install column has a visible header', () => {
  render(<ItemTable items={[providerItem]} />)
  expect(screen.getByRole('columnheader', { name: '安装' })).toBeInTheDocument()
})

test('there is no review column or verdict', () => {
  render(<ItemTable items={[providerItem, mcpItem]} />)
  expect(screen.queryByRole('columnheader', { name: '审查' })).toBeNull()
  expect(screen.queryByText('待审')).toBeNull()
})

test('a package without ratings shows no zero score', () => {
  const { container } = render(<ItemTable items={[providerItem]} />)
  expect(container.textContent).not.toContain('0.0')
})

test('empty result explains itself and offers the given way out', () => {
  render(<ItemTable items={[]} emptyAction={<button type="button">清除搜索和筛选</button>} />)
  expect(screen.getByText('没有符合条件的包')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '清除搜索和筛选' })).toBeInTheDocument()
})
