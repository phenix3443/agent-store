import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { intlMock, intlServerMock } from '../../../test-intl'

mock.module('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next/headers', () => ({ headers: async () => new Headers() }))
mock.module('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: () => {
    throw new Error('NEXT_REDIRECT')
  },
}))
mock.module('next-intl', () => intlMock)
mock.module('next-intl/server', () => intlServerMock)

let user: Record<string, string> | null = null
let plan: string | null = 'free'
let favorites: unknown[] | null = []
mock.module('@/lib/auth/server', () => ({
  auth: () => ({
    api: {
      getSession: async () => (user ? { user } : null),
      getToken: async () => ({ token: 'jwt' }),
      listUserAccounts: async () => [{ providerId: 'github' }],
    },
  }),
}))
mock.module('@as/sdk', () => ({
  StoreClient: class {
    async getMyEntitlements() {
      return plan ? { data: { plan }, error: null } : { data: null, error: 'HTTP 401' }
    }
    async listFavorites() {
      return favorites ? { data: { favorites }, error: null } : { data: null, error: 'HTTP 500', status: 500 }
    }
  },
}))

beforeEach(() => {
  user = { name: 'Octo Cat', username: 'octocat', email: 'octo@example.com' }
  plan = 'free'
  favorites = []
})
afterEach(() => cleanup())

const { default: DashboardPage } = await import('../page')
const page = async (tab?: string) => render(await DashboardPage({ searchParams: Promise.resolve({ tab }) }))

test('signed out: a gate with a log-in button instead of a redirect', async () => {
  user = null
  await page()
  // The gate opens the log-in dialog on arrival, which hides the page behind it.
  expect(screen.getByRole('dialog').textContent).toContain('登录 Agent Store')
  expect(screen.getByRole('heading', { level: 1, name: '请先登录', hidden: true })).toBeTruthy()
  expect(screen.getByRole('button', { name: '登录', hidden: true })).toBeTruthy()
})

test('the account tab shows the real account fields and the sign-in method', async () => {
  await page()
  const text = document.body.textContent ?? ''
  for (const v of ['octocat', 'octo@example.com', 'GitHub', 'Free']) expect(text).toContain(v)
  expect(screen.getByRole('link', { name: '账户' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('link', { name: '退出登录' }).getAttribute('href')).toBe('/auth/logout')
  expect(text).not.toContain('同步')
})

test('Free: the subscription tab sends you to pricing', async () => {
  await page('subscription')
  expect(screen.getByRole('link', { name: '升级 Pro' }).getAttribute('href')).toBe('/pricing')
})

test('Pro: active, what it includes, and how to manage it', async () => {
  plan = 'pro'
  await page('subscription')
  const text = document.body.textContent ?? ''
  expect(text).toContain('生效中')
  expect(text).toContain('多 Key 轮换')
  expect(text).toContain('support@panghuli.tech')
  expect(screen.queryByRole('link', { name: '升级 Pro' })).toBeNull()
})

test('an unreadable plan is said so, not shown as Free', async () => {
  plan = null
  await page('subscription')
  expect(screen.getByRole('status').textContent).toContain('暂时查不到订阅状态')
  expect(screen.queryByRole('link', { name: '升级 Pro' })).toBeNull()
})

const skill = {
  id: 'github:anthropics/skills/frontend-design',
  kind: 'skill',
  name: 'frontend-design',
  author: { name: 'anthropics' },
}

test('the favorites tab lists each favorite with a link to it and a remove button', async () => {
  favorites = [
    { id: skill.id, createdAt: '2026-11-14T00:00:00.000Z', resource: skill },
    { id: 'github:gone/repo/skill', createdAt: '2026-11-13T00:00:00.000Z', resource: null },
  ]
  await page('favorites')
  expect(screen.getByRole('link', { name: '收藏' }).getAttribute('aria-current')).toBe('page')
  expect(document.body.textContent).toContain('2 个')
  expect(screen.getByRole('link', { name: '查看 frontend-design' }).getAttribute('href')).toBe(
    '/store/skill/github:anthropics/skills/frontend-design'
  )
  expect(screen.getByRole('button', { name: '从收藏移除 frontend-design' })).toBeTruthy()
  // One the catalog dropped can still be removed, but has nothing to open.
  expect(document.body.textContent).toContain('目录里已没有这个条目')
  expect(screen.getByRole('button', { name: '从收藏移除 github:gone/repo/skill' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: /查看 github:gone/ })).toBeNull()
})

test('no favorites: an empty state that sends you to the store', async () => {
  await page('favorites')
  expect(document.body.textContent).toContain('还没有收藏')
  expect(screen.getByRole('link', { name: '去商店' }).getAttribute('href')).toBe('/store')
})

test('an unreadable favorites list is said so, not shown as empty', async () => {
  favorites = null
  await page('favorites')
  expect(screen.getByRole('status').textContent).toContain('暂时查不到收藏')
  expect(document.body.textContent).not.toContain('还没有收藏')
})
