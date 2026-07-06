import { test, expect, afterEach, beforeEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Item } from '@as/types'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

const item: Item = {
  id: 'item-1', slug: 'openai-provider', name: 'OpenAI Provider',
  description: 'GPT-4o provider', category: 'provider',
  version: '1.0.0',
  publisher: { id: 'p', slug: 'openai', name: 'OpenAI', avatarUrl: '', tier: 'official' },
  compatibleWith: ['claude'], tags: ['ai'], downloads: 100, rating: 4.5,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  configSchema: {}, supportedModels: ['gpt-4o'],
}

const { DetailDrawer } = await import('../DetailDrawer')
const { ClientStateProvider } = await import('../ClientStateProvider')

function renderDrawer(onOpenChange: (open: boolean) => void = () => {}) {
  return render(
    <ClientStateProvider>
      <DetailDrawer item={item} open onOpenChange={onOpenChange} />
    </ClientStateProvider>
  )
}

test('renders item name and description when open', () => {
  renderDrawer()
  expect(screen.getByText('OpenAI Provider')).toBeInTheDocument()
  expect(screen.getByText('GPT-4o provider')).toBeInTheDocument()
})

test('renders supported models for a provider item', () => {
  renderDrawer()
  expect(screen.getByText('gpt-4o')).toBeInTheDocument()
})

test('renders the primary install CTA', () => {
  renderDrawer()
  expect(screen.getByText('安装到 CLI 客户端')).toBeInTheDocument()
})

test('clicking the install CTA switches to the installed state', () => {
  renderDrawer()
  fireEvent.click(screen.getByText('安装到 CLI 客户端'))
  expect(screen.getByText('已安装到 CLI 客户端')).toBeInTheDocument()
})

test('calls onOpenChange(false) when the close button is clicked', () => {
  const onOpenChange = mock(() => {})
  renderDrawer(onOpenChange)
  fireEvent.click(screen.getByLabelText('关闭'))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
