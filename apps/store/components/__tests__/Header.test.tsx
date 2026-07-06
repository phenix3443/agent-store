import { test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

mock.module('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))
mock.module('next/navigation', () => ({
  usePathname: () => '/store',
  useRouter: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}))
const NAV: Record<string, string> = {
  store: '商店',
  docs: '文档',
  pricing: '定价',
  publish: '发布',
  login: '登录',
  myHome: '我的主页',
  settings: '设置',
  theme: '主题',
  language: '界面语言',
  logout: '退出登录',
  zh: '中文',
  en: 'English',
}
mock.module('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => NAV[key.split('.').pop() ?? ''] ?? key,
}))

afterEach(() => { cleanup() })

const { Header } = await import('../Header')

test('renders brand name', () => {
  render(<Header user={null} />)
  expect(screen.getByText('Agent Store')).toBeInTheDocument()
})

test('renders nav links', () => {
  render(<Header user={null} />)
  expect(screen.getByText('商店')).toBeInTheDocument()
  expect(screen.getByText('文档')).toBeInTheDocument()
  expect(screen.getByText('定价')).toBeInTheDocument()
})

test('publish button links to ?publish=1 on the store page', () => {
  render(<Header user={null} />)
  const publishLink = screen.getByText('发布').closest('a')
  expect(publishLink?.getAttribute('href')).toBe('/store?publish=1')
})

test('shows the login button when logged out', () => {
  render(<Header user={null} />)
  expect(screen.getByText('登录')).toBeInTheDocument()
})

test('shows the avatar initial when logged in', () => {
  render(<Header user={{ initial: 'Y', username: 'you', email: 'you@dev' }} />)
  expect(screen.getByText('Y')).toBeInTheDocument()
})

test('theme and language controls are hidden until the settings menu is opened', () => {
  render(<Header user={null} />)
  expect(screen.queryByRole('group', { name: 'language' })).not.toBeInTheDocument()
})

test('opening the settings menu reveals theme and language controls (logged out)', () => {
  render(<Header user={null} />)
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  expect(screen.getByText('主题')).toBeInTheDocument()
  expect(screen.getByText('界面语言')).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'language' })).toBeInTheDocument()
})
