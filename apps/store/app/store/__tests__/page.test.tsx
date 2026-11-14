import { describe, test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import type { ResourceSummary } from '@as/types'
import { intlMock, intlServerMock } from '../../../test-intl'
import { mcpResource, providerResource, skillResource, summary } from '../../../components/__tests__/fixtures'

afterEach(() => {
  cleanup()
  calls.length = 0
  probes = 0
})

mock.module('next/link', () => ({
  default: ({ href, children, className, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; className?: string; scroll?: boolean }) => (
    <a href={href} className={className} {...rest}>{children}</a>
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
mock.module('next-intl/server', () => intlServerMock)

const all: ResourceSummary[] = [summary(skillResource), summary(mcpResource), summary(providerResource)]
const calls: unknown[][] = []
let fail = false
let probes = 0
let enabled = false

// The API searches and filters; the mock answers the way it would, so the test
// can check the page sends the query instead of filtering itself.
mock.module('@/lib/catalog', () => ({
  PAGE_SIZE: 50,
  listResources: async (query: { kind: string | null; q: string; sort: string }, offset = 0, limit = 50) => {
    calls.push([query, offset, limit])
    if (fail) return { ok: false, error: 'HTTP 503' }
    const resources = all.filter((r) => (!query.kind || r.kind === query.kind) && (!query.q || r.name.includes(query.q)))
    return { ok: true, resources, nextOffset: null }
  },
  getResource: async () => null,
  supplementEnabled: async () => {
    probes++
    return enabled
  },
  searchSupplement: async () => null,
}))

const { default: StorePage } = await import('../page')

describe('StorePage', () => {
  async function renderPage(searchParams: Record<string, string> = {}) {
    return render(await StorePage({ searchParams: Promise.resolve(searchParams) }))
  }

  test('renders the first page from /api/resources under a page heading, with the most installed above it', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('商店7 万多个技能和 MCP，搜到就能装。')
    expect(screen.getByRole('heading', { level: 2, name: '全部' })).toBeInTheDocument()
    expect(screen.getAllByText('brainstorming').length).toBe(2)
    expect(screen.getByText('共 3 个包')).toBeInTheDocument()
    expect(calls).toEqual([
      [{ kind: null, q: '', sort: 'default' }, 0, 50],
      [{ kind: null, q: '', sort: 'installs' }, 0, 4],
    ])
    expect(screen.getByRole('heading', { name: '热门' })).toBeInTheDocument()
  })

  test('kind, search and sort go to the API; the popular row is left out of a filtered list', async () => {
    await renderPage({ category: 'mcp', q: 'Anki', sort: 'name' })
    expect(calls).toEqual([[{ kind: 'mcp', q: 'Anki', sort: 'name' }, 0, 50]])
    expect(screen.getByText('Anki MCP')).toBeInTheDocument()
    expect(screen.queryByText('brainstorming')).toBeNull()
    expect(screen.queryByRole('heading', { name: '热门' })).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: '「Anki」的结果' })).toBeInTheDocument()
  })

  test('the search bar sits in the page, with the category and sort groups under it', async () => {
    const { container } = await renderPage({ category: 'skill' })
    expect(container.querySelector('[data-store-search]')).not.toBeNull()
    expect(screen.getByRole('group', { name: '类别' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '排序' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '技能' })).toBeInTheDocument()
  })

  test('an empty search result is explained and can be cleared', async () => {
    await renderPage({ q: 'zzz-no-such-package' })
    expect(screen.getByText('没有找到匹配的包')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '清除筛选' })[0]?.getAttribute('href')).toBe('/store')
  })

  test('an API failure shows the error state, not "no matches"', async () => {
    fail = true
    try {
      await renderPage({ q: 'git' })
    } finally {
      fail = false
    }
    expect(screen.getByRole('alert').textContent).toContain('目录暂时连不上')
    expect(screen.queryByText('没有找到匹配的包')).toBeNull()
    expect(screen.getByRole('link', { name: '重试' }).getAttribute('href')).toBe('/store?q=git')
  })

  test('?state= opens the loading, empty and error states without calling the API', async () => {
    await renderPage({ state: 'loading' })
    expect(screen.getByRole('status', { name: '正在加载包' })).toBeInTheDocument()
    cleanup()
    await renderPage({ state: 'empty' })
    expect(screen.getByText('没有找到匹配的包')).toBeInTheDocument()
    cleanup()
    await renderPage({ state: 'error' })
    expect(screen.getByText('目录暂时连不上')).toBeInTheDocument()
    expect(calls).toEqual([])
    expect(probes).toBe(0)
  })

  test('only the unfiltered list labels each row with its category', async () => {
    const { container } = await renderPage()
    expect(container.querySelectorAll('ul[aria-label="全部"] .kind').length).toBe(3)
    cleanup()
    for (const category of ['skill', 'mcp', 'provider']) {
      const { container: c } = await renderPage({ category })
      expect(c.querySelectorAll('.store-rows .kind').length).toBe(0)
      cleanup()
    }
  })

  test('the supplement stays out of sight when the deployment has it off', async () => {
    enabled = false
    const { container } = await renderPage({ q: 'zzz-no-such-package' })
    expect(probes).toBe(1)
    expect(container.querySelector('[data-supplement]')).toBeNull()
    expect(container.textContent).not.toContain('ClawHub')
  })

  test('with the supplement on, a search with no matches offers it and says where the query goes', async () => {
    enabled = true
    try {
      const { container } = await renderPage({ q: 'zzz-no-such-package' })
      expect(container.querySelector('[data-supplement="offer"]')).not.toBeNull()
      expect(container.textContent).toContain('会把搜索词发给第三方技能目录站点')
      expect(screen.getByRole('button', { name: '发送并查找' })).toBeInTheDocument()
    } finally {
      enabled = false
    }
  })

  test('no supplement is offered for MCP or provider searches, and none is probed for', async () => {
    enabled = true
    try {
      const { container } = await renderPage({ q: 'zzz', category: 'mcp' })
      expect(container.querySelector('[data-supplement]')).toBeNull()
      expect(probes).toBe(0)
    } finally {
      enabled = false
    }
  })

  test('?state=empty&supplement= opens a supplement state for review', async () => {
    const { container } = await renderPage({ state: 'empty', q: 'zzz', supplement: 'unavailable' })
    expect(container.querySelector('[data-supplement="unavailable"]')?.textContent).toContain('暂时没法查询其他技能目录')
  })

  test('there is no verified-only switch the API cannot filter on, and no favorites', async () => {
    const { container } = await renderPage()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(container.textContent).not.toContain('收藏')
  })
})
