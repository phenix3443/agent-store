import { test, expect, mock, afterEach, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { intlMock } from '../../test-intl'

mock.module('next-intl', () => intlMock)
const refresh = mock(() => {})
mock.module('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
mock.module('@/lib/auth/token', () => ({ getAuthToken: async () => 'token' }))

type R = { data: unknown; error: string | null }
const ok = (data: unknown): R => ({ data, error: null })
const cancelSubscription = mock(async (_token: string): Promise<R> => ok({ subscription: { status: 'canceling' } }))
const resumeSubscription = mock(async (_token: string): Promise<R> => ok({ subscription: { status: 'active' } }))
const openBillingPortal = mock(async (_token: string): Promise<R> => ok({ portalUrl: 'https://pancake.waffo.ai/consumer/portal/store/STO_1#token=t' }))
mock.module('@as/sdk', () => ({
  StoreClient: class {
    cancelSubscription = cancelSubscription
    resumeSubscription = resumeSubscription
    openBillingPortal = openBillingPortal
  },
}))

afterEach(() => {
  cleanup()
  for (const m of [refresh, cancelSubscription, resumeSubscription, openBillingPortal]) m.mockClear()
})

const { SubscriptionActions, BillingPortalButton } = await import('../SubscriptionActions')

test('cancel asks first, says what happens and what does not, and focuses keeping Pro', async () => {
  render(<SubscriptionActions mode="cancel" endDate="2026年12月1日" />)
  fireEvent.click(screen.getByRole('button', { name: '取消订阅' }))
  const dialog = screen.getByRole('alertdialog', { name: '取消订阅？' })
  expect(dialog.textContent).toContain('Pro 保留到 2026年12月1日，之后回到 Free，不再自动续费。')
  expect(dialog.textContent).toContain('取消不会退回已付的费用；到期前随时可以恢复。')
  await waitFor(() => expect(document.activeElement?.textContent).toBe('保留 Pro'))
  expect(cancelSubscription).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: '保留 Pro' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(cancelSubscription).not.toHaveBeenCalled()
})

test('confirming cancels with the user token, closes and refreshes the page data', async () => {
  render(<SubscriptionActions mode="cancel" endDate={null} />)
  fireEvent.click(screen.getByRole('button', { name: '取消订阅' }))
  expect(screen.getByRole('alertdialog').textContent).toContain('Pro 保留到本期结束')
  fireEvent.click(screen.getByRole('button', { name: '确认取消' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(cancelSubscription).toHaveBeenCalledWith('token')
  expect(refresh).toHaveBeenCalled()
  expect(screen.getByRole('status').textContent).toBe('已设为到期后取消。')
})

test('a failed cancel stays in the dialog and says so', async () => {
  cancelSubscription.mockImplementationOnce(async () => ({ data: null, error: 'Failed to cancel subscription' }))
  render(<SubscriptionActions mode="cancel" endDate={null} />)
  fireEvent.click(screen.getByRole('button', { name: '取消订阅' }))
  fireEvent.click(screen.getByRole('button', { name: '确认取消' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('没能取消订阅，请稍后刷新查看。'))
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  expect(refresh).not.toHaveBeenCalled()
})

test('resume needs no confirmation', async () => {
  render(<SubscriptionActions mode="resume" endDate={null} />)
  fireEvent.click(screen.getByRole('button', { name: '恢复订阅' }))
  await waitFor(() => expect(resumeSubscription).toHaveBeenCalledWith('token'))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('订阅已恢复。'))
  expect(refresh).toHaveBeenCalled()
})

test('the portal button sends the browser to the Waffo link', async () => {
  const assign = spyOn(window.location, 'assign').mockImplementation(() => {})
  render(<BillingPortalButton />)
  fireEvent.click(screen.getByRole('button', { name: '查看订单与付款' }))
  await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pancake.waffo.ai/consumer/portal/store/STO_1#token=t'))
  assign.mockRestore()
})

test('a portal link that cannot be made is reported', async () => {
  openBillingPortal.mockImplementationOnce(async () => ({ data: null, error: 'Billing not configured' }))
  render(<BillingPortalButton />)
  fireEvent.click(screen.getByRole('button', { name: '查看订单与付款' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('没能打开 Waffo 账单页，请稍后再试。'))
})
