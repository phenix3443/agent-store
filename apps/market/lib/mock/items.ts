import type { Item } from '@aas/types'
import { MOCK_PUBLISHERS, getPublisherBySlug as getPublisherBySlugImpl } from './publishers'

export { getPublisherBySlugImpl as getPublisherBySlug }

function publisher(slug: string) {
  const p = MOCK_PUBLISHERS.find((pub) => pub.slug === slug)
  if (!p) throw new Error(`Unknown mock publisher slug: ${slug}`)
  return p
}

export const MOCK_ITEMS: Item[] = [
  {
    id: 'item-superpowers',
    slug: 'superpowers',
    name: 'Superpowers',
    description: '一套用于头脑风暴、写计划、TDD 执行的技能合集，覆盖完整开发流程。',
    readmeUrl: 'https://example.com/readme/superpowers.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=superpowers',
    category: 'skill',
    version: '2.4.0',
    publisher: publisher('anthropic'),
    compatibleWith: ['claude', 'codex'],
    tags: ['workflow', 'planning', 'tdd'],
    downloads: 128_000,
    rating: 4.9,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-06-20T00:00:00Z',
    contentUrl: 'https://example.com/content/superpowers.zip',
  },
  {
    id: 'item-pdf-processing',
    slug: 'pdf-processing',
    name: 'PDF Processing',
    description: '读取、生成、审阅 PDF 文件，支持渲染检查与内容抽取。',
    readmeUrl: 'https://example.com/readme/pdf-processing.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=pdf',
    category: 'skill',
    version: '1.3.2',
    publisher: publisher('anthropic'),
    compatibleWith: ['claude', 'codex'],
    tags: ['pdf', 'documents'],
    downloads: 64_500,
    rating: 4.7,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-04-10T00:00:00Z',
    updatedAt: '2026-06-15T00:00:00Z',
    contentUrl: 'https://example.com/content/pdf-processing.zip',
  },
  {
    id: 'item-frontend-design',
    slug: 'frontend-design',
    name: 'Frontend Design',
    description: '为新建或重塑 UI 提供有主见的视觉设计指导，避免千篇一律的默认样式。',
    readmeUrl: 'https://example.com/readme/frontend-design.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=frontend',
    category: 'skill',
    version: '1.0.5',
    publisher: publisher('devfox'),
    compatibleWith: ['claude'],
    tags: ['design', 'frontend', 'ui'],
    downloads: 31_200,
    rating: 4.5,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-25T00:00:00Z',
    contentUrl: 'https://example.com/content/frontend-design.zip',
  },
  {
    id: 'item-openai-provider',
    slug: 'openai-provider',
    name: 'OpenAI Provider',
    description: 'OpenAI 官方模型接入配置，支持 GPT-4o 系列。',
    readmeUrl: 'https://example.com/readme/openai-provider.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=openai-provider',
    category: 'provider',
    version: '1.8.0',
    publisher: publisher('openai'),
    compatibleWith: ['claude', 'codex'],
    tags: ['openai', 'gpt'],
    downloads: 890_000,
    rating: 4.8,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-06-28T00:00:00Z',
    configSchema: {},
    supportedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1'],
  },
  {
    id: 'item-yls-provider',
    slug: 'yls-me',
    name: 'YLS.me 中转',
    description: '已验证的第三方模型中转服务，支持多模型映射与延迟监控。',
    readmeUrl: 'https://example.com/readme/yls-me.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=yls-provider',
    category: 'provider',
    version: '0.9.1',
    publisher: publisher('yls-me'),
    compatibleWith: ['codex'],
    tags: ['relay', 'proxy'],
    downloads: 12_800,
    rating: 4.2,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-03-20T00:00:00Z',
    updatedAt: '2026-06-10T00:00:00Z',
    configSchema: {},
    supportedModels: ['gpt-4o', 'claude-3-7-sonnet'],
  },
  {
    id: 'item-mcp-fs',
    slug: 'filesystem-mcp',
    name: 'Filesystem MCP',
    description: '本地文件系统访问的 MCP 服务，通过 stdio 启动。',
    readmeUrl: 'https://example.com/readme/filesystem-mcp.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=fs-mcp',
    category: 'mcp',
    version: '0.5.3',
    publisher: publisher('anthropic'),
    compatibleWith: ['claude', 'codex'],
    tags: ['mcp', 'filesystem'],
    downloads: 45_600,
    rating: 4.6,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-06-05T00:00:00Z',
    transport: 'stdio',
    serverCommand: 'npx -y @modelcontextprotocol/server-filesystem',
    configSchema: {},
  },
  {
    id: 'item-mcp-search',
    slug: 'web-search-mcp',
    name: 'Web Search MCP',
    description: '远程 HTTP MCP 服务，提供实时网页检索能力。',
    readmeUrl: 'https://example.com/readme/web-search-mcp.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=search-mcp',
    category: 'mcp',
    version: '1.1.0',
    publisher: publisher('devfox'),
    compatibleWith: ['claude'],
    tags: ['mcp', 'search'],
    downloads: 9_400,
    rating: 4.1,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-05-18T00:00:00Z',
    updatedAt: '2026-06-22T00:00:00Z',
    transport: 'http',
    url: 'https://mcp.example.com/web-search',
    configSchema: {},
  },
]

export interface GetMockItemsOptions {
  category?: 'provider' | 'skill' | 'mcp' | null
  q?: string
  sort?: 'downloads' | 'created' | 'rating'
}

function matchesQuery(item: Item, q: string): boolean {
  const needle = q.toLowerCase()
  return (
    item.name.toLowerCase().includes(needle) ||
    item.description.toLowerCase().includes(needle) ||
    item.tags.some((tag) => tag.toLowerCase().includes(needle))
  )
}

export function getItems(options: GetMockItemsOptions): Item[] {
  const { category, q, sort = 'downloads' } = options
  let result = MOCK_ITEMS.slice()

  if (category) result = result.filter((i) => i.category === category)
  if (q) result = result.filter((i) => matchesQuery(i, q))

  result.sort((a, b) => {
    if (sort === 'created') return b.createdAt.localeCompare(a.createdAt)
    if (sort === 'rating') return b.rating - a.rating
    return b.downloads - a.downloads
  })

  return result
}

export function getItemBySlug(slug: string): Item | null {
  return MOCK_ITEMS.find((i) => i.slug === slug) ?? null
}

export function getFeaturedItems(): Item[] {
  return getItems({ sort: 'downloads' }).slice(0, 6)
}

export function getPublisherItems(publisherSlug: string): Item[] {
  return MOCK_ITEMS.filter((i) => i.publisher.slug === publisherSlug)
}
