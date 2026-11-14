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

const { ResourceRows } = await import('../ResourceRows')

const rows = [summary(skillResource), summary(mcpResource), summary(providerResource)]

function renderRows(showCategory = true, resources = rows) {
  return render(<ResourceRows resources={resources} showCategory={showCategory} label="全部" />)
}

test('renders name, the lead sentence of the description, author without internal catalog sources', () => {
  renderRows()
  expect(screen.getByRole('list', { name: '全部' })).toBeInTheDocument()
  expect(screen.getAllByRole('listitem').length).toBe(3)
  expect(screen.getByText('brainstorming')).toBeInTheDocument()
  expect(screen.getByText('Explore intent before building.')).toBeInTheDocument()
  expect(screen.getByText('obra')).toBeInTheDocument()
  expect(screen.queryByText('GitHub · skills.sh')).toBeNull()
  expect(screen.queryByText('MCP Registry')).toBeNull()
  expect(screen.queryByText('内置')).toBeNull()
})

test('shows skills.sh installs where the data has them, and a dash, not a zero, where it does not', () => {
  const { container } = renderRows()
  expect(screen.getAllByText('12.4K').length).toBeGreaterThan(0)
  expect(screen.getAllByText('没有安装量数据').length).toBeGreaterThan(0)
  expect(container.textContent).not.toMatch(/(^|\D)0(\D|$)/)
})

test('shows GitHub stars where the catalog has them, and a dash where it does not', () => {
  renderRows()
  expect(screen.getByText('152.3K')).toBeInTheDocument()
  expect(screen.getByText('1.3K')).toBeInTheDocument()
  expect(screen.getAllByText('GitHub 星标 152.3K').length).toBe(1)
})

test('verified records carry the tick, others none', () => {
  const { container } = renderRows()
  expect(container.querySelectorAll('[data-tier="verified"]').length).toBe(1)
})

test('the package name links to its detail page and marks the open one', () => {
  const { container } = renderRows()
  const link = screen.getByRole('link', { name: 'brainstorming' })
  expect(link.getAttribute('href')).toBe('/store/skill/github:obra/superpowers/brainstorming')
  expect(link.getAttribute('aria-current')).toBeNull()
  expect(screen.getByRole('link', { name: 'Anki MCP' }).getAttribute('aria-current')).toBe('true')
  expect(container.querySelectorAll('[data-current]').length).toBe(1)
})

test('the install button is its own control, outside the link', () => {
  renderRows()
  const button = screen.getByRole('button', { name: '在桌面客户端中安装 brainstorming' })
  expect(button.textContent).toBe('安装')
  expect(button.closest('a')).toBeNull()
})

test('each row is coloured by its kind', () => {
  renderRows()
  expect(screen.getAllByRole('listitem').map((li) => li.dataset.kind)).toEqual(['skill', 'mcp', 'provider'])
})

test('there is no review verdict, favorite or installed state', () => {
  const { container } = renderRows()
  expect(screen.queryByText('待审')).toBeNull()
  expect(container.textContent).not.toContain('收藏')
  expect(container.textContent).not.toContain('已安装')
})

test('the unfiltered list labels each row with its category; a single-kind list does not', () => {
  const { container } = renderRows()
  expect([...container.querySelectorAll('.kind')].map((el) => el.textContent)).toEqual(['技能', 'MCP', '供应商'])
  cleanup()
  const { container: one } = renderRows(false, [summary(skillResource)])
  expect(one.querySelectorAll('.kind').length).toBe(0)
})
