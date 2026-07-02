import { test, expect, afterEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Item } from '@aas/types'

afterEach(() => { cleanup() })

const item: Item = {
  id: 'item-1', slug: 'openai-provider', name: 'OpenAI Provider',
  description: 'GPT-4o provider', readmeUrl: '', icon: '', category: 'provider',
  version: '1.0.0',
  publisher: { id: 'p', slug: 'openai', name: 'OpenAI', avatarUrl: '', tier: 'official' },
  compatibleWith: ['claude'], tags: ['ai'], downloads: 100, rating: 4.5,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  configSchema: {}, supportedModels: ['gpt-4o'],
}

const { DetailDrawer } = await import('../DetailDrawer')

test('renders item name and description when open', () => {
  render(<DetailDrawer item={item} open onOpenChange={() => {}} />)
  expect(screen.getByText('OpenAI Provider')).toBeInTheDocument()
  expect(screen.getByText('GPT-4o provider')).toBeInTheDocument()
})

test('renders supported models for a provider item', () => {
  render(<DetailDrawer item={item} open onOpenChange={() => {}} />)
  expect(screen.getByText('gpt-4o')).toBeInTheDocument()
})

test('calls onOpenChange(false) when the close button is clicked', () => {
  const onOpenChange = mock(() => {})
  render(<DetailDrawer item={item} open onOpenChange={onOpenChange} />)
  fireEvent.click(screen.getByLabelText('关闭'))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
