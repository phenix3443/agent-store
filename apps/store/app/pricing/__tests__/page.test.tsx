import { test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { intlMock } from '../../../test-intl'

mock.module('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next-intl', () => intlMock)
const createCheckout = mock(async () => ({ data: { checkoutUrl: 'https://pay.test/x' } }))
mock.module('@as/sdk', () => ({
  StoreClient: class {
    createCheckout = createCheckout
  },
}))
mock.module('@/lib/auth/token', () => ({ getAuthToken: async () => 'token' }))

afterEach(() => {
  cleanup()
  createCheckout.mockClear()
})

const { default: PricingPage } = await import('../page')

test('pro shows the monthly price and trial by default and the lifetime offer on its own period', async () => {
  render(<PricingPage />)
  const pro = screen.getByRole('region', { name: 'Pro' })
  expect(within(pro).getByText('$9.99')).toBeInTheDocument()
  expect(within(pro).getByText('14 天免费试用')).toBeInTheDocument()
  expect(within(pro).getByRole('button', { name: '免费试用 14 天' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '按年' }))
  expect(within(pro).getByText('$99')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '终身买断' }))
  expect(screen.getByRole('button', { name: '终身买断' }).getAttribute('aria-pressed')).toBe('true')
  expect(within(pro).getByText('$199')).toBeInTheDocument()
  expect(within(pro).queryByRole('button', { name: /试用/ })).not.toBeInTheDocument()
  fireEvent.click(within(pro).getByRole('button', { name: '买断' }))
  await waitFor(() => expect(createCheckout).toHaveBeenCalledWith({ period: 'lifetime', trial: false }, { token: 'token' }))
})

// Smart routing and key rotation are implemented behind the Pro entitlement, not planned.
test('the comparison lists every Pro feature as available and none as planned', () => {
  render(<PricingPage />)
  expect(document.body.textContent).not.toContain('规划中')
  const row = (name: string) => screen.getByRole('rowheader', { name }).closest('tr')!
  expect(within(row('智能路由')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['—无', '有'])
  expect(within(row('多 Key 轮换')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['—无', '有'])
  expect(within(row('失败降级的供应商数')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2 家', '不限'])
})
