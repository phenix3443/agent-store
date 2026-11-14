import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { intlMock } from '../../test-intl'

const refresh = mock(() => {})
mock.module('next/link', () => ({
  default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next/navigation', () => ({
  usePathname: () => '/store',
  useRouter: () => ({ refresh, replace: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  // bun shares module mocks between files, so every mock exposes what any page imports.
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
mock.module('next-intl', () => intlMock)

beforeEach(() => {
  refresh.mockClear()
  document.cookie = 'locale=zh'
})
afterEach(() => { cleanup() })

const { Header } = await import('../Header')

function openMenu(name: string) {
  fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' })
}

test('renders brand name', () => {
  render(<Header user={null} />)
  expect(screen.getByRole('link', { name: 'Agent Store' }).getAttribute('href')).toBe('/')
})

test('the main nav lists store, desktop app, docs and pricing, and marks the current section', () => {
  render(<Header user={null} />)
  const nav = screen.getByRole('navigation', { name: '主导航' })
  const links = within(nav).getAllByRole('link')
  expect(links.map((a) => a.textContent)).toEqual(['商店', '客户端', '文档', '定价'])
  expect(nav.textContent).not.toContain('发布')
  expect(within(nav).getByRole('link', { name: '商店' }).getAttribute('aria-current')).toBe('page')
  expect(within(nav).getByRole('link', { name: '文档' }).getAttribute('aria-current')).toBeNull()
})

test('there is no theme switch', () => {
  render(<Header user={null} />)
  fireEvent.click(screen.getByRole('button', { name: '菜单' }))
  for (const word of ['外观', '浅色', '深色', '跟随系统']) expect(screen.queryByText(word)).toBeNull()
})

test('the download button is always on the bar', () => {
  render(<Header user={null} />)
  expect(screen.getByRole('link', { name: '下载' }).getAttribute('href')).toBe('/download')
})

test('shows the login button when logged out', () => {
  render(<Header user={null} />)
  expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument()
})

test('shows the avatar initial when logged in', () => {
  render(<Header user={{ initial: 'Y', username: 'you', email: 'you@dev' }} />)
  expect(screen.getByRole('button', { name: '账号菜单' }).textContent).toBe('Y')
})

test('the language button switches to the other locale and refreshes', () => {
  render(<Header user={null} />)
  const button = screen.getByRole('button', { name: '界面语言：English' })
  expect(button.textContent).toBe('EN')
  fireEvent.click(button)
  expect(document.cookie).toContain('locale=en')
  expect(refresh).toHaveBeenCalled()
})

test('the narrow-screen menu holds search, the four sections, login, language and download', () => {
  render(<Header user={null} />)
  fireEvent.click(screen.getByRole('button', { name: '菜单' }))
  const sheet = screen.getByRole('dialog')
  expect(within(sheet).getByRole('searchbox', { name: '搜索' })).toBeInTheDocument()
  const nav = within(sheet).getByRole('navigation', { name: '主导航' })
  expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['商店', '客户端', '文档', '定价'])
  expect(within(sheet).getByRole('button', { name: '登录' })).toBeInTheDocument()
  expect(within(sheet).getByRole('button', { name: '界面语言：English' })).toBeInTheDocument()
  expect(within(sheet).getByRole('link', { name: '下载桌面客户端' }).getAttribute('href')).toBe('/download')
})

test('the search button on narrow screens opens the same menu', () => {
  render(<Header user={null} />)
  fireEvent.click(screen.getByRole('button', { name: '搜索' }))
  expect(within(screen.getByRole('dialog')).getByRole('searchbox', { name: '搜索' })).toBeInTheDocument()
})

test('the account menu holds the dashboard and sign-out', () => {
  render(<Header user={{ initial: 'Y', username: 'you', email: 'you@dev' }} />)
  openMenu('账号菜单')
  expect(screen.getByRole('menuitem', { name: '个人面板' }).getAttribute('href')).toBe('/dashboard')
  expect(screen.getByRole('menuitem', { name: '退出登录' }).getAttribute('href')).toBe('/auth/logout')
  expect(screen.queryByRole('menuitem', { name: '收藏' })).toBeNull()
})
