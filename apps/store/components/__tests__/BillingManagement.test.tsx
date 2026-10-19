import { afterEach, expect, mock, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

let action: { method: string; value?: string } | null = null

mock.module('@as/sdk', () => ({
  StoreClient: class {
    async cancelMySubscription() {
      action = { method: 'cancel' }
      return { data: { status: 'canceling' }, error: null }
    }
    async requestMyRefund(reason: string) {
      action = { method: 'refund', value: reason }
      return { data: { ticketId: 'TKT_1', status: 'pending' }, error: null }
    }
  },
}))

afterEach(() => {
  cleanup()
  action = null
})

const { BillingManagement } = await import('../BillingManagement')

const billing = { paidAmount: '9.99', currency: 'USD', billingPeriod: 'monthly', status: 'active' }

test('requires confirmation before canceling an active subscription', async () => {
  render(<BillingManagement token="tok-1" initialBilling={billing} />)
  fireEvent.click(screen.getByRole('button', { name: '取消订阅' }))
  expect(action).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: '确认取消' }))
  expect(await screen.findByText('订阅将在当前计费周期结束后停止')).toBeInTheDocument()
  expect(action).toEqual({ method: 'cancel' })
})

test('submits a refund reason through the authenticated flow', async () => {
  render(<BillingManagement token="tok-1" initialBilling={billing} />)
  fireEvent.click(screen.getByRole('button', { name: '申请退款' }))
  fireEvent.change(screen.getByLabelText('退款原因'), { target: { value: 'Not suitable for my workflow' } })
  fireEvent.click(screen.getByRole('button', { name: '提交退款申请' }))

  expect(await screen.findByText('退款申请已提交审核')).toBeInTheDocument()
  expect(action).toEqual({ method: 'refund', value: 'Not suitable for my workflow' })
})
