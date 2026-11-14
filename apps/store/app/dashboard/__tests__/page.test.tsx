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
mock.module('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

let user: Record<string, string> | null = null
let plan: string | null = 'free'
type Sub = { plan: string; status: string; period: string | null; currentPeriodEnd: string | null }
let subscription: Sub | null | undefined = null
const active: Sub = { plan: 'pro', status: 'active', period: 'monthly', currentPeriodEnd: '2026-12-01' }
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
    async getMySubscription() {
      return subscription === undefined ? { data: null, error: 'HTTP 500' } : { data: { subscription }, error: null }
    }
  },
}))

beforeEach(() => {
  user = { name: 'Octo Cat', username: 'octocat', email: 'octo@example.com' }
  plan = 'free'
  subscription = null
})
afterEach(() => cleanup())

const { default: DashboardPage } = await import('../page')
const page = async (tab?: string, state?: string) =>
  render(await DashboardPage({ searchParams: Promise.resolve({ tab, state }) }))
const text = () => document.body.textContent ?? ''

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
  expect(screen.queryByRole('button', { name: '取消订阅' })).toBeNull()
})

test('active: plan, period, renewal date, what it includes, cancel and the Waffo portal', async () => {
  plan = 'pro'
  subscription = active
  await page('subscription')
  for (const v of ['生效中', 'Pro · 按月', '2026年12月1日 自动续费。', '多 Key 轮换', 'Waffo']) expect(text()).toContain(v)
  expect(screen.getByRole('button', { name: '取消订阅' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '查看订单与付款' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: '升级 Pro' })).toBeNull()
  expect(text()).not.toContain('support@panghuli.tech')
})

test('canceling: ends on a date, still Pro until then, and can be resumed', async () => {
  plan = 'pro'
  subscription = { ...active, status: 'canceling' }
  await page('subscription')
  expect(text()).toContain('到期后取消')
  expect(text()).toContain('Pro 保留到 2026年12月1日，之后回到 Free，不再扣款。')
  expect(screen.getByRole('button', { name: '恢复订阅' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '取消订阅' })).toBeNull()
})

test('canceled: shown as ended, with a way to subscribe again and no perks', async () => {
  subscription = { ...active, status: 'canceled' }
  await page('subscription')
  expect(text()).toContain('已取消')
  expect(text()).toContain('订阅已于 2026年12月1日 结束，现在是 Free。')
  expect(screen.getByRole('link', { name: '重新订阅' }).getAttribute('href')).toBe('/pricing')
  expect(text()).not.toContain('Pro 包含')
  for (const name of ['取消订阅', '恢复订阅']) expect(screen.queryByRole('button', { name })).toBeNull()
})

test('lifetime has no renewal and nothing to cancel', async () => {
  plan = 'pro'
  subscription = { ...active, period: 'lifetime', currentPeriodEnd: null }
  await page('subscription')
  expect(text()).toContain('Pro · 终身买断')
  expect(text()).toContain('终身买断，没有续费。')
  expect(screen.queryByRole('button', { name: '取消订阅' })).toBeNull()
})

test('without a period end the lines say so without a date', async () => {
  plan = 'pro'
  subscription = { ...active, status: 'canceling', period: null, currentPeriodEnd: null }
  await page('subscription')
  expect(text()).toContain('Pro 保留到本期结束')
  expect(text()).not.toContain('{date}')
})

test('past due: says the payment failed and offers the portal, not cancel', async () => {
  subscription = { ...active, status: 'past_due' }
  await page('subscription')
  expect(text()).toContain('付款未成功')
  expect(screen.queryByRole('button', { name: '取消订阅' })).toBeNull()
  expect(screen.getByRole('button', { name: '查看订单与付款' })).toBeTruthy()
})

test('an unreadable subscription is said so, with a retry, not shown as Free', async () => {
  subscription = undefined
  await page('subscription')
  expect(screen.getByRole('alert').textContent).toContain('暂时查不到订阅状态')
  expect(screen.getByRole('link', { name: '重试' }).getAttribute('href')).toBe('/dashboard?tab=subscription')
  expect(screen.queryByRole('link', { name: '升级 Pro' })).toBeNull()
})

test('?state= opens the loading and error states for review', async () => {
  subscription = active
  await page('subscription', 'loading')
  expect(screen.getByRole('status', { name: '正在加载' })).toBeTruthy()
  cleanup()
  await page('subscription', 'error')
  expect(screen.getByRole('alert').textContent).toContain('暂时查不到订阅状态')
})
