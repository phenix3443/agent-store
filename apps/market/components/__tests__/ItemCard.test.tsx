import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Item } from '@aas/types'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

mock.module('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

const { ItemCard } = await import('../ItemCard')
const { ClientStateProvider } = await import('../ClientStateProvider')

const mockItem: Item = {
  id: 'item-1',
  slug: 'openai-provider',
  name: 'OpenAI Provider',
  description: 'OpenAI API provider with GPT-4o support',
  readmeUrl: 'https://example.com/readme',
  icon: 'https://example.com/icon.png',
  category: 'provider',
  version: '1.2.0',
  publisher: {
    id: 'pub-1',
    slug: 'openai',
    name: 'OpenAI',
    avatarUrl: 'https://example.com/avatar.png',
    tier: 'official',
  },
  compatibleWith: ['claude', 'codex'],
  tags: ['ai', 'openai'],
  downloads: 1_200_000,
  rating: 4.8,
  status: 'published',
  installHook: { steps: [] },
  createdAt: '2026-06-18T00:00:00Z',
  updatedAt: '2026-06-18T00:00:00Z',
  configSchema: {},
  supportedModels: ['gpt-4o'],
}

function renderCard(item: Item = mockItem) {
  return render(
    <ClientStateProvider>
      <ItemCard item={item} />
    </ClientStateProvider>
  )
}

test('ItemCard renders item name', () => {
  renderCard()
  expect(screen.getByText('OpenAI Provider')).toBeInTheDocument()
})

test('ItemCard renders description', () => {
  renderCard()
  expect(screen.getByText('OpenAI API provider with GPT-4o support')).toBeInTheDocument()
})

test('ItemCard renders formatted downloads: 1.2M', () => {
  renderCard()
  expect(screen.getByText('1.2M installs')).toBeInTheDocument()
})

test('ItemCard renders 999 downloads without abbreviation', () => {
  renderCard({ ...mockItem, downloads: 999 })
  expect(screen.getByText('999 installs')).toBeInTheDocument()
})

test('ItemCard renders 1500 downloads as 1.5K', () => {
  renderCard({ ...mockItem, downloads: 1500 })
  expect(screen.getByText('1.5K installs')).toBeInTheDocument()
})

test('ItemCard links to correct detail page', () => {
  renderCard()
  const link = screen.getByRole('link')
  expect(link.getAttribute('href')).toBe('/store/provider/openai-provider')
})

test('ItemCard renders compat tools', () => {
  renderCard()
  expect(screen.getByText('claude · codex')).toBeInTheDocument()
})

test('ItemCard clicking favorite toggles aria-label', () => {
  renderCard()
  const favButton = screen.getByLabelText('收藏')
  fireEvent.click(favButton)
  expect(screen.getByLabelText('取消收藏')).toBeInTheDocument()
})

test('ItemCard clicking install shows installed state', () => {
  renderCard()
  const installButton = screen.getByLabelText('安装')
  fireEvent.click(installButton)
  expect(screen.getByText('已安装')).toBeInTheDocument()
})
