import { describe, test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import type { ResourceSummary } from '@as/types'
import { intlMock } from '../../../test-intl'
import { mcpResource, providerResource, skillResource, summary } from '../../../components/__tests__/fixtures'

afterEach(() => {
  cleanup()
  calls.length = 0
})

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
  redirect: () => {
    throw new Error('NEXT_REDIRECT')
  },
}))
mock.module('next-intl', () => intlMock)

const all: ResourceSummary[] = [summary(skillResource), summary(mcpResource), summary(providerResource)]
const calls: unknown[][] = []
let fail = false

// The API searches and filters; the mock answers the way it would, so the test
// can check the page sends the query instead of filtering itself.
mock.module('@/lib/catalog', () => ({
  PAGE_SIZE: 50,
  listResources: async (query: { kind: string | null; q: string }, offset = 0) => {
    calls.push([query, offset])
    if (fail) return { ok: false, error: 'HTTP 503' }
    const resources = all.filter((r) => (!query.kind || r.kind === query.kind) && (!query.q || r.name.includes(query.q)))
    return { ok: true, resources, nextOffset: null }
  },
  getResource: async () => null,
}))

const { default: StorePage } = await import('../page')
const { ClientStateProvider } = await import('../../../components/ClientStateProvider')

describe('StorePage', () => {
  async function renderPage(searchParams: Record<string, string> = {}) {
    return render(
      <ClientStateProvider>{await StorePage({ searchParams: Promise.resolve(searchParams) })}</ClientStateProvider>
    )
  }

  test('renders the first page from /api/resources under a page heading', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '商店' })).toBeInTheDocument()
    expect(screen.getByText('brainstorming')).toBeInTheDocument()
    expect(screen.getByText('共 3 个包')).toBeInTheDocument()
    expect(calls).toEqual([[{ kind: null, q: '', sort: 'default' }, 0]])
  })

  test('kind, search and sort go to the API', async () => {
    await renderPage({ category: 'mcp', q: 'Anki', sort: 'name' })
    expect(calls).toEqual([[{ kind: 'mcp', q: 'Anki', sort: 'name' }, 0]])
    expect(screen.getByText('Anki MCP')).toBeInTheDocument()
    expect(screen.queryByText('brainstorming')).toBeNull()
  })

  test('an empty search result is explained and can be cleared', async () => {
    await renderPage({ q: 'zzz-no-such-package' })
    expect(screen.getByText('没有符合条件的包')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '清除搜索和筛选' })[0]?.getAttribute('href')).toBe('/store')
  })

  test('an API failure shows the error state, not "no matches"', async () => {
    fail = true
    try {
      await renderPage({ q: 'git' })
    } finally {
      fail = false
    }
    expect(screen.getByRole('alert').textContent).toContain('目录暂时不可用')
    expect(screen.queryByText('没有符合条件的包')).toBeNull()
    expect(screen.getByRole('link', { name: '重试' }).getAttribute('href')).toBe('/store?q=git')
  })

  test('?state= opens the loading, empty and error states without calling the API', async () => {
    await renderPage({ state: 'loading' })
    expect(screen.getByRole('status', { name: '正在加载包' })).toBeInTheDocument()
    cleanup()
    await renderPage({ state: 'empty' })
    expect(screen.getByText('没有符合条件的包')).toBeInTheDocument()
    cleanup()
    await renderPage({ state: 'error' })
    expect(screen.getByText('目录暂时不可用')).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  test('only the All tab has a category column', async () => {
    await renderPage()
    expect(screen.getByRole('columnheader', { name: '类别' })).toBeInTheDocument()
    cleanup()
    for (const category of ['skill', 'mcp', 'provider']) {
      await renderPage({ category })
      expect(screen.getAllByRole('columnheader').length).toBe(4)
      expect(screen.queryByRole('columnheader', { name: '类别' })).toBeNull()
      cleanup()
    }
  })

  test('there is no verified-only switch the API cannot filter on', async () => {
    await renderPage()
    expect(screen.queryByRole('switch')).toBeNull()
  })
})
