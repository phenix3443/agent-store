// apps/market/app/__tests__/page.test.tsx
import { describe, test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import type { Item } from '@aas/types'

afterEach(() => { cleanup() })

const mockItem = (id: string, name: string): Item => ({
  id,
  slug: id,
  name,
  description: `${name} description`,
  category: 'skill',
  icon: '/icon.png',
  version: '1.0.0',
  downloads: 100,
  compatibleWith: ['Claude'],
  publisher: { tier: 'official', slug: id, name: `${name} publisher` },
  readme_url: null,
  status: 'published',
  created_at: '2024-01-01T00:00:00Z',
})

mock.module('@/lib/queries/items', () => ({
  getFeaturedItems: mock(async () => ({ data: [mockItem('featured-1', 'Featured Agent')] })),
  getNewItems: mock(async () => ({ data: [mockItem('new-1', 'New Agent')] })),
}))

// Must be imported after the mock is set up
const { default: HomePage } = await import('../page')

describe('HomePage', () => {
  test('renders the hero heading', async () => {
    render(await HomePage())
    expect(screen.getByRole('heading', { level: 1, name: 'AI Agent Store' })).toBeInTheDocument()
  })

  test('renders featured and new section headings', async () => {
    render(await HomePage())
    expect(screen.getByRole('heading', { level: 2, name: 'Featured' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'New' })).toBeInTheDocument()
  })

  test('renders featured item from query result', async () => {
    render(await HomePage())
    expect(screen.getByText('Featured Agent')).toBeInTheDocument()
  })

  test('renders new item from query result', async () => {
    render(await HomePage())
    expect(screen.getByText('New Agent')).toBeInTheDocument()
  })
})
