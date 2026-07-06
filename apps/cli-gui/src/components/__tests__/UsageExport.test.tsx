import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { UsageExport } from '../UsageExport'

afterEach(() => {
  cleanup()
  mock.restore()
})

test('exports as CSV and shows the returned file path', async () => {
  const calls: unknown[][] = []
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args?: unknown[]) => {
    calls.push([method, ...(args ?? [])])
    return '/home/.agents/exports/usage-2026.csv'
  }) as typeof rpcModule.callRpc)

  render(<UsageExport />)
  fireEvent.click(screen.getByText('CSV'))

  await waitFor(() => expect(screen.getByText(/已导出到.*usage-2026\.csv/)).toBeInTheDocument())
  expect(calls[0]).toEqual(['exportUsage', 'csv', 30])
})

test('shows a failure message when the export RPC throws', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async () => {
    throw new Error('boom')
  }) as typeof rpcModule.callRpc)

  render(<UsageExport />)
  fireEvent.click(screen.getByText('JSON'))

  await waitFor(() => expect(screen.getByText('导出失败')).toBeInTheDocument())
})
