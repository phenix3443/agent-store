import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { BudgetCard } from '../BudgetCard'
import type { BudgetConfig, BudgetStatus } from '@as/types'

afterEach(() => {
  cleanup()
  mock.restore()
})

function mockRpc(status: BudgetStatus, config: BudgetConfig, onSet?: (c: BudgetConfig) => void) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args?: unknown[]) => {
    if (method === 'getBudgetStatus') return status
    if (method === 'getBudget') return config
    if (method === 'setBudget') {
      onSet?.(args?.[0] as BudgetConfig)
      return args?.[0]
    }
    throw new Error(`unexpected RPC in BudgetCard test: ${method}`)
  }) as typeof rpcModule.callRpc)
}

test('shows spend vs limit and percentage when a budget is set', async () => {
  mockRpc(
    { monthlyLimitUsd: 100, spentUsd: 42, monthStart: '2026-07-01', fraction: 0.42, projectedUsd: 84, projectedOverBudget: false, alertLevel: 'none' },
    { monthlyLimitUsd: 100, alertThresholds: [0.8, 1] }
  )

  render(<BudgetCard />)

  expect(await screen.findByText((_, el) => el?.tagName === 'DD' && el.textContent === '$42.00 / $100.0042%')).toBeInTheDocument()
  expect(screen.getByText('预计月末')).toBeInTheDocument()
  expect(screen.getByText('$84.00')).toBeInTheDocument()
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '42')
})

test('shows the input to set a budget when no limit exists', async () => {
  mockRpc(
    { monthlyLimitUsd: null, spentUsd: 5, monthStart: '2026-07-01', fraction: null, projectedUsd: 10, projectedOverBudget: false, alertLevel: 'none' },
    { monthlyLimitUsd: null, alertThresholds: [0.8, 1] }
  )

  render(<BudgetCard />)

  expect(await screen.findByLabelText('月度预算')).toBeInTheDocument()
  expect(screen.getByText('保存')).toBeInTheDocument()
  expect(await screen.findByText('尚未设置预算。')).toBeInTheDocument()
})

test('rejects a negative limit without calling setBudget', async () => {
  let saved: BudgetConfig | undefined
  mockRpc(
    { monthlyLimitUsd: null, spentUsd: 0, monthStart: '2026-07-01', fraction: null, projectedUsd: 0, projectedOverBudget: false, alertLevel: 'none' },
    { monthlyLimitUsd: null, alertThresholds: [0.8, 1] },
    (c) => { saved = c }
  )

  render(<BudgetCard />)

  fireEvent.change(await screen.findByLabelText('月度预算'), { target: { value: '-5' } })
  fireEvent.click(screen.getByText('保存'))

  expect(await screen.findByRole('alert')).toHaveTextContent('请输入不小于 0 的数字')
  expect(saved).toBeUndefined()
})

test('saving a budget calls setBudget with the entered limit', async () => {
  let saved: BudgetConfig | undefined
  mockRpc(
    { monthlyLimitUsd: null, spentUsd: 0, monthStart: '2026-07-01', fraction: null, projectedUsd: 0, projectedOverBudget: false, alertLevel: 'none' },
    { monthlyLimitUsd: null, alertThresholds: [0.8, 1] },
    (c) => { saved = c }
  )

  render(<BudgetCard />)

  const input = await screen.findByLabelText('月度预算')
  fireEvent.change(input, { target: { value: '50' } })
  fireEvent.click(screen.getByText('保存'))

  await waitFor(() => expect(saved).toEqual({ monthlyLimitUsd: 50, alertThresholds: [0.8, 1] }))
})

test('renders an over-budget warning when alertLevel is over', async () => {
  mockRpc(
    { monthlyLimitUsd: 20, spentUsd: 25, monthStart: '2026-07-01', fraction: 1.25, projectedUsd: 50, projectedOverBudget: true, alertLevel: 'over' },
    { monthlyLimitUsd: 20, alertThresholds: [0.8, 1] }
  )

  render(<BudgetCard />)

  expect(await screen.findByText('已超出预算')).toBeInTheDocument()
})

test('renders a near-limit warning when alertLevel is warn', async () => {
  mockRpc(
    { monthlyLimitUsd: 20, spentUsd: 17, monthStart: '2026-07-01', fraction: 0.85, projectedUsd: 30, projectedOverBudget: true, alertLevel: 'warn' },
    { monthlyLimitUsd: 20, alertThresholds: [0.8, 1] }
  )

  render(<BudgetCard />)

  expect(await screen.findByText('接近预算上限')).toBeInTheDocument()
})
