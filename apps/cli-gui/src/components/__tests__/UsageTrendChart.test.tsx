import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { UsageTrendChart } from '../UsageTrendChart'
import type { UsageSummaryRow } from '@as/types'

afterEach(() => cleanup())

function row(overrides: Partial<UsageSummaryRow>): UsageSummaryRow {
  return {
    date: '2026-07-01', providerSlug: 'p', target: 'claude', model: 'm',
    requestCount: 0, successCount: 0, unpricedRequestCount: 0,
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0,
    ...overrides,
  }
}

test('renders an svg polyline and a filled area path with one point per distinct date', () => {
  const rows = [
    row({ date: '2026-07-01', costUsd: 1 }),
    row({ date: '2026-07-01', providerSlug: 'q', costUsd: 2 }),
    row({ date: '2026-07-02', costUsd: 3 }),
  ]

  const { container } = render(<UsageTrendChart rows={rows} />)

  const polyline = container.querySelector('polyline')
  expect(polyline).not.toBeNull()
  const points = polyline!.getAttribute('points')!.trim().split(' ')
  expect(points).toHaveLength(2)
  expect(container.querySelector('polygon')).not.toBeNull()
  expect(container.querySelectorAll('circle')).toHaveLength(2)
})

test('renders nothing when there is no data; the page shows the empty state', () => {
  const { container } = render(<UsageTrendChart rows={[]} />)
  expect(container.querySelector('svg')).toBeNull()
})

test('a single day is one point without a line, and the scale shows dollars', () => {
  const { container } = render(<UsageTrendChart rows={[row({ date: '2026-07-01', costUsd: 0.03 })]} />)
  expect(container.querySelector('polyline')).toBeNull()
  expect(container.querySelectorAll('circle')).toHaveLength(1)
  expect(screen.getByRole('img', { name: '每日费用折线图' })).toBeInTheDocument()
  expect(screen.getByText('$0.05')).toBeInTheDocument()
  expect(screen.getByText('7/1')).toBeInTheDocument()
})
