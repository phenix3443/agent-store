import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { intlMock } from '../../test-intl'

const refresh = mock(() => {})
const setTheme = mock(() => {})
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
mock.module('next-themes', () => ({ useTheme: () => ({ theme: 'system', setTheme }) }))

beforeEach(() => {
  refresh.mockClear()
  setTheme.mockClear()
  document.cookie = 'locale=zh'
})
afterEach(() => { cleanup() })

const { Header } = await import('../Header')

function openMenu(name: string) {
  fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' })
}

test('renders brand name', () => {
  render(<Header user={null} />)
  expect(screen.getByText('Agent Store')).toBeInTheDocument()
})

test('renders nav links and marks the current section', () => {
  render(<Header user={null} />)
  const nav = screen.getByRole('navigation', { name: '主导航' })
  expect(nav.textContent).toContain('商店')
  expect(nav.textContent).toContain('文档')
  expect(nav.textContent).not.toContain('合集')
  expect(nav.textContent).not.toContain('主题')
  expect(nav.textContent).toContain('定价')
  expect(screen.getByRole('link', { name: '商店' }).getAttribute('aria-current')).toBe('page')
})

test('there is no publish entry, on the bar or in the menu', () => {
  render(<Header user={null} />)
  openMenu('菜单')
  expect(screen.queryByText('发布')).toBeNull()
})

test('shows the login button when logged out', () => {
  render(<Header user={null} />)
  expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument()
})

test('shows the avatar initial when logged in', () => {
  render(<Header user={{ initial: 'Y', username: 'you', email: 'you@dev' }} />)
  expect(screen.getByText('Y')).toBeInTheDocument()
})

test('theme and language controls are hidden until the menu is opened', () => {
  render(<Header user={null} />)
  expect(screen.queryByRole('menu')).toBeNull()
  expect(screen.queryByText('界面语言')).toBeNull()
})

test('opening the menu reveals theme and language choices (logged out)', () => {
  render(<Header user={null} />)
  openMenu('菜单')
  expect(screen.getByRole('menu')).toBeInTheDocument()
  expect(screen.getByText('外观')).toBeInTheDocument()
  expect(screen.getByText('界面语言')).toBeInTheDocument()
  expect(screen.getByRole('menuitemradio', { name: '跟随系统' }).getAttribute('aria-checked')).toBe('true')
  expect(screen.getByRole('menuitemradio', { name: '中文' }).getAttribute('aria-checked')).toBe('true')
})

test('choosing a theme hands it to next-themes', () => {
  render(<Header user={null} />)
  openMenu('菜单')
  fireEvent.click(screen.getByRole('menuitemradio', { name: '深色' }))
  expect(setTheme).toHaveBeenCalledWith('dark')
})

test('selecting English sets the locale cookie and refreshes', () => {
  render(<Header user={null} />)
  openMenu('菜单')
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'English' }))
  expect(document.cookie).toContain('locale=en')
  expect(refresh).toHaveBeenCalled()
})

test('the account menu holds settings and sign-out', () => {
  render(<Header user={{ initial: 'Y', username: 'you', email: 'you@dev' }} />)
  openMenu('账号菜单')
  expect(screen.getByRole('menuitem', { name: '设置' }).getAttribute('href')).toBe('/dashboard')
  expect(screen.queryByRole('menuitem', { name: '我的主页' })).toBeNull()
  expect(screen.getByRole('menuitem', { name: '退出登录' }).getAttribute('href')).toBe('/auth/logout')
})
