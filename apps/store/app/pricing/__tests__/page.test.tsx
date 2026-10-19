import { afterEach, expect, mock, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

let checkoutCalled = false

mock.module('@/lib/auth/token', () => ({ getAuthToken: async () => null }))
mock.module('@as/sdk', () => ({
  StoreClient: class {
    async createCheckout() {
      checkoutCalled = true
      return { data: { checkoutUrl: 'https://pay.example' }, error: null }
    }
  },
}))

afterEach(() => {
  cleanup()
  checkoutCalled = false
})

const { default: PricingPage } = await import('../page')

test('requires sign-in before creating any checkout', async () => {
  render(<PricingPage />)
  fireEvent.click(screen.getByRole('button', { name: '直接升级 Pro' }))

  expect(await screen.findByText('请先登录后购买')).toBeInTheDocument()
  expect(checkoutCalled).toBe(false)
})
