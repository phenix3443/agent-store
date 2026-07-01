import { test, expect, afterEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Publisher, Item } from '@aas/types'

afterEach(() => { cleanup() })

mock.module('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

const publisher: Publisher = {
  id: 'p1', slug: 'openai', name: 'OpenAI', avatarUrl: '', tier: 'official', bio: 'Official provider',
}

const items: Item[] = [{
  id: 'item-1', slug: 'openai-provider', name: 'OpenAI Provider', description: 'desc',
  readmeUrl: '', icon: '', category: 'provider', version: '1.0.0', publisher,
  compatibleWith: ['claude'], tags: [], downloads: 10, rating: 4,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  configSchema: {}, supportedModels: [],
}]

const { PublisherDrawer } = await import('../PublisherDrawer')

test('renders publisher name and bio', () => {
  render(<PublisherDrawer publisher={publisher} items={items} open onOpenChange={() => {}} />)
  expect(screen.getByText('OpenAI')).toBeInTheDocument()
  expect(screen.getByText('Official provider')).toBeInTheDocument()
})

test('renders the publisher item list', () => {
  render(<PublisherDrawer publisher={publisher} items={items} open onOpenChange={() => {}} />)
  expect(screen.getByText('OpenAI Provider')).toBeInTheDocument()
})

test('calls onOpenChange(false) when closed', () => {
  const onOpenChange = mock(() => {})
  render(<PublisherDrawer publisher={publisher} items={items} open onOpenChange={onOpenChange} />)
  fireEvent.click(screen.getByLabelText('关闭'))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
