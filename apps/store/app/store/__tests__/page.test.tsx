import { describe, test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { intlMock } from '../../../test-intl'

afterEach(() => { cleanup() })

mock.module('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))
mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => '/store',
  useSearchParams: () => new URLSearchParams(),
  // bun shares module mocks between files, so every mock exposes what any page imports.
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
mock.module('next-intl', () => intlMock)

// The store page now fetches its catalog from the API server via @/lib/catalog.
// Back the mock with the offline mock catalog so the page renders deterministic
// data without hitting the network.
const { getItems: mockGetItems } = await import('../../../lib/mock/items')
mock.module('@/lib/catalog', () => ({
  getItems: async (opts: Parameters<typeof mockGetItems>[0]) => mockGetItems(opts),
}))

const { default: StorePage } = await import('../page')
const { ClientStateProvider } = await import('../../../components/ClientStateProvider')

describe('StorePage', () => {
  async function renderPage(searchParams: Record<string, string> = {}) {
    return render(
      <ClientStateProvider>{await StorePage({ searchParams: Promise.resolve(searchParams) })}</ClientStateProvider>
    )
  }

  test('renders items from the mock catalog under a page heading', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '商店' })).toBeInTheDocument()
    expect(screen.getByText('Superpowers')).toBeInTheDocument()
  })

  test('has no carousel: each package appears once', async () => {
    await renderPage()
    expect(screen.getAllByText('Superpowers').length).toBe(1)
  })

  test('filters by category search param', async () => {
    await renderPage({ category: 'mcp' })
    expect(screen.getByText('Filesystem MCP')).toBeInTheDocument()
    expect(screen.getByText('Web Search MCP')).toBeInTheDocument()
    expect(screen.queryByText('Superpowers')).toBeNull()
  })

  test('category counts stay for all categories while one is selected', async () => {
    await renderPage({ category: 'mcp' })
    expect(screen.getByRole('button', { name: /^技能 [1-9]/ })).toBeInTheDocument()
  })

  test('an empty search result is explained and can be cleared', async () => {
    await renderPage({ q: 'zzz-no-such-package' })
    expect(screen.getByText('没有符合条件的包')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '清除搜索和筛选' })[0]?.getAttribute('href')).toBe('/store')
  })
})
