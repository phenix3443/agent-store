import { describe, test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup, within } from '@testing-library/react'
import type { Topic, TopicSummary } from '@as/types'
import { intlMock, intlServerMock } from '../../../test-intl'
import { mcpItem, providerItem } from '../../../components/__tests__/fixtures'

afterEach(() => {
  cleanup()
})

mock.module('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => '/topics/agent-workflow',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
mock.module('next-intl', () => intlMock)
mock.module('next-intl/server', () => intlServerMock)

const SUMMARIES: TopicSummary[] = [
  { slug: 'agent-workflow', title: 'Agent 工作流', description: '让 agent 先想清楚再动手。', packageCount: 6 },
  { slug: 'browser-automation', title: '浏览器自动化与调试', description: '让 agent 打开真实网页。', packageCount: 2 },
]
const TOPIC: Topic = {
  slug: 'agent-workflow',
  title: 'Agent 工作流',
  description: '让 agent 先想清楚再动手。',
  intro: '这组包管的是 agent 怎么干活。',
  capabilities: ['在动手实现之前先梳理需求', '把复杂问题拆成分步思考'],
  packages: [providerItem, mcpItem],
  related: [{ slug: 'coding-practices', title: '编码规范与 API 设计' }],
}

mock.module('@/lib/catalog', () => ({
  getItems: async () => [],
  getTopics: async () => SUMMARIES,
  getTopic: async (slug: string) => (slug === TOPIC.slug ? TOPIC : null),
}))

const { default: TopicsPage } = await import('../page')
const { default: TopicPage } = await import('../[slug]/page')
const { ClientStateProvider } = await import('../../../components/ClientStateProvider')

describe('TopicsPage', () => {
  test('lists every topic with its own text, package count and link', async () => {
    render(await TopicsPage())
    expect(screen.getByRole('heading', { level: 1, name: '主题' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: '全部主题' })
    const links = within(list).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/topics/agent-workflow', '/topics/browser-automation'])
    expect(within(links[0]!).getByText('让 agent 先想清楚再动手。')).toBeInTheDocument()
    expect(within(links[0]!).getByText('6 个包')).toBeInTheDocument()
  })
})

describe('TopicPage', () => {
  async function renderTopic(slug: string) {
    return render(<ClientStateProvider>{await TopicPage({ params: Promise.resolve({ slug }) })}</ClientStateProvider>)
  }

  test('shows the topic text from the API and its packages in the store table', async () => {
    await renderTopic('agent-workflow')
    expect(screen.getByRole('heading', { level: 1, name: 'Agent 工作流' })).toBeInTheDocument()
    expect(screen.getByText('这组包管的是 agent 怎么干活。')).toBeInTheDocument()
    expect(screen.getByText('把复杂问题拆成分步思考')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('OpenAI Provider').closest('a')?.getAttribute('href')).toBe('/store/provider/openai-provider')
    expect(within(table).getByText('Anki MCP')).toBeInTheDocument()
    expect(within(table).getAllByRole('button', { name: /安装/ }).length).toBe(2)
  })

  test('links related topics by slug', async () => {
    await renderTopic('agent-workflow')
    expect(screen.getByRole('link', { name: '编码规范与 API 设计' }).getAttribute('href')).toBe('/topics/coding-practices')
  })

  test('an unknown topic is a 404', async () => {
    await expect(TopicPage({ params: Promise.resolve({ slug: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('/collections', () => {
  test('permanently redirects to /topics', async () => {
    const { nextConfig } = await import('../../../next.config.mjs')
    const redirects = await nextConfig.redirects!()
    expect(redirects).toContainEqual({ source: '/collections', destination: '/topics', permanent: true })
  })
})
