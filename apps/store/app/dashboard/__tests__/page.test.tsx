import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { intlMock, intlServerMock } from '../../../test-intl'

mock.module('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next/headers', () => ({ headers: async () => new Headers() }))
mock.module('next-intl', () => intlMock)
mock.module('next-intl/server', () => intlServerMock)

let user: Record<string, string> | null = null
let plan: string | null = 'free'
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
  },
}))

beforeEach(() => {
  user = { name: 'Octo Cat', username: 'octocat', email: 'octo@example.com' }
  plan = 'free'
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
  for (const word of ['收藏', '同步']) expect(text).not.toContain(word)
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
