import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { intlMock, intlServerMock } from '../../../test-intl'

mock.module('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next/headers', () => ({ headers: async () => new Headers() }))
mock.module('next-intl', () => intlMock)
mock.module('next-intl/server', () => intlServerMock)

type Sub = { plan: string; status: string; period: string | null; currentPeriodEnd: string | null }
let signedIn = false
let subscription: Sub | null | 'error' = null
const active: Sub = { plan: 'pro', status: 'active', period: 'monthly', currentPeriodEnd: '2026-12-01' }

mock.module('@/lib/auth/server', () => ({
  auth: () => ({
    api: {
      getToken: async () => {
        if (!signedIn) throw new Error('no session')
        return { token: 'jwt' }
      },
    },
  }),
}))
const createCheckout = mock(async () => ({ data: { checkoutUrl: 'https://pay.test/x' } }))
mock.module('@as/sdk', () => ({
  StoreClient: class {
    createCheckout = createCheckout
    async getMySubscription() {
      if (subscription === 'error') throw new Error('network')
      return { data: { subscription }, error: null }
    }
  },
}))
mock.module('@/lib/auth/token', () => ({ getAuthToken: async () => 'token' }))

beforeEach(() => {
  signedIn = false
  subscription = null
})
afterEach(() => {
  cleanup()
  createCheckout.mockClear()
})

const { default: PricingPage } = await import('../page')
const page = async () => render(await PricingPage())
const pro = () => screen.getByRole('region', { name: 'Pro' })
const period = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

function expectCheckoutButtons() {
  expect(within(pro()).getByText('14 天免费试用')).toBeInTheDocument()
  expect(within(pro()).getByRole('button', { name: '免费试用 14 天' })).toBeInTheDocument()
  expect(within(pro()).getByRole('button', { name: '直接升级 Pro' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '管理订阅' })).not.toBeInTheDocument()
}

function expectNoCheckout() {
  for (const name of [/试用/, '直接升级 Pro', '买断']) expect(within(pro()).queryByRole('button', { name })).not.toBeInTheDocument()
}

test('pro shows the monthly price and trial by default and the lifetime offer on its own period', async () => {
  await page()
  expect(within(pro()).getByText('$9.99')).toBeInTheDocument()
  expectCheckoutButtons()

  period('按年')
  expect(within(pro()).getByText('$99')).toBeInTheDocument()

  period('终身买断')
  expect(screen.getByRole('button', { name: '终身买断' }).getAttribute('aria-pressed')).toBe('true')
  expect(within(pro()).getByText('$199')).toBeInTheDocument()
  expect(within(pro()).queryByRole('button', { name: /试用/ })).not.toBeInTheDocument()
  fireEvent.click(within(pro()).getByRole('button', { name: '买断' }))
  await waitFor(() => expect(createCheckout).toHaveBeenCalledWith({ period: 'lifetime', trial: false }, { token: 'token' }))
})

// Smart routing and key rotation are implemented behind the Pro entitlement, not planned.
test('the comparison lists every Pro feature as available and none as planned', async () => {
  await page()
  expect(document.body.textContent).not.toContain('规划中')
  const row = (name: string) => screen.getByRole('rowheader', { name }).closest('tr')!
  expect(within(row('智能路由')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['—无', '有'])
  expect(within(row('多 Key 轮换')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['—无', '有'])
  expect(within(row('失败降级的供应商数')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2 家', '不限'])
})

test('free, canceled and an unreadable subscription look the same as signed out', async () => {
  signedIn = true
  for (const s of [null, { ...active, status: 'canceled' }, 'error'] as const) {
    subscription = s
    await page()
    expectCheckoutButtons()
    cleanup()
  }
})

test('active monthly: its period is the current plan with the renewal date and a link to manage it', async () => {
  signedIn = true
  subscription = active
  await page()
  expect(screen.getByRole('button', { name: '按月' }).getAttribute('aria-pressed')).toBe('true')
  expect(within(pro()).getByText('当前方案')).toBeInTheDocument()
  expect(within(pro()).getByText('2026年12月1日 自动续费。')).toBeInTheDocument()
  expect(within(pro()).getByRole('link', { name: '管理订阅' }).getAttribute('href')).toBe('/dashboard?tab=subscription')
  expectNoCheckout()
})

test('active yearly opens on the yearly period', async () => {
  signedIn = true
  subscription = { ...active, period: 'yearly' }
  await page()
  expect(screen.getByRole('button', { name: '按年' }).getAttribute('aria-pressed')).toBe('true')
  expect(within(pro()).getByText('$99')).toBeInTheDocument()
  expect(within(pro()).getByText('当前方案')).toBeInTheDocument()
})

test('a subscriber is not offered another period or lifetime, which would be a second order', async () => {
  signedIn = true
  subscription = active
  await page()
  for (const name of ['按年', '终身买断']) {
    period(name)
    expect(within(pro()).queryByText('当前方案')).not.toBeInTheDocument()
    expect(within(pro()).getByText('你已订阅 Pro · 按月，这里不能改成其他周期或买断。')).toBeInTheDocument()
    expect(within(pro()).getByRole('link', { name: '管理订阅' })).toBeInTheDocument()
    expectNoCheckout()
  }
})

test('canceling: still the current plan, with the end date as the dashboard words it', async () => {
  signedIn = true
  subscription = { ...active, status: 'canceling' }
  await page()
  expect(within(pro()).getByText('当前方案')).toBeInTheDocument()
  expect(within(pro()).getByText('Pro 保留到 2026年12月1日，之后回到 Free，不再扣款。')).toBeInTheDocument()
  expect(within(pro()).getByRole('link', { name: '管理订阅' })).toBeInTheDocument()
  expectNoCheckout()
})

test('canceling without a period end says so without a date', async () => {
  signedIn = true
  subscription = { ...active, status: 'canceling', currentPeriodEnd: null }
  await page()
  expect(within(pro()).getByText('Pro 保留到本期结束，之后回到 Free，不再扣款。')).toBeInTheDocument()
})

test('past due: marked as a failed payment, with a link to manage it', async () => {
  signedIn = true
  subscription = { ...active, status: 'past_due' }
  await page()
  expect(within(pro()).getByText('付款未成功').className).toContain('chip-warn')
  expect(within(pro()).getByRole('link', { name: '管理订阅' })).toBeInTheDocument()
  expectNoCheckout()
})

test('lifetime: the lifetime period is current and the button goes to the dashboard to see the order', async () => {
  signedIn = true
  subscription = { ...active, period: 'lifetime', currentPeriodEnd: null }
  await page()
  expect(screen.getByRole('button', { name: '终身买断' }).getAttribute('aria-pressed')).toBe('true')
  expect(within(pro()).getByText('当前方案')).toBeInTheDocument()
  expect(within(pro()).getByText('终身买断，没有续费。')).toBeInTheDocument()
  expect(within(pro()).getByRole('link', { name: '查看方案与订单' }).getAttribute('href')).toBe('/dashboard?tab=subscription')
  expect(screen.queryByRole('link', { name: '管理订阅' })).not.toBeInTheDocument()
  expectNoCheckout()

  period('按月')
  expect(within(pro()).getByText('你已终身买断 Pro，不需要再订阅。')).toBeInTheDocument()
  expect(within(pro()).getByRole('link', { name: '查看方案与订单' })).toBeInTheDocument()
  expectNoCheckout()
})

test('an old subscription with no recorded period is current on both subscription periods', async () => {
  signedIn = true
  subscription = { ...active, period: null }
  await page()
  expect(within(pro()).getByText('当前方案')).toBeInTheDocument()
  period('按年')
  expect(within(pro()).getByText('当前方案')).toBeInTheDocument()
  period('终身买断')
  expect(within(pro()).getByText('你已订阅 Pro，这里不能改成其他周期或买断。')).toBeInTheDocument()
})
