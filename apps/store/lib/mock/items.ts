import type { Item } from '@as/types'
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
    id: 'item-local',
    slug: 'local',
    name: '本地中转',
    description:
      '内置本地中转：将 Claude Code / Codex 的 baseURL 指向本机监听端口，请求按 Level 优先级转发到已配置的上游供应商，失败自动降级。无需 API 密钥。',
    readmeUrl: 'https://example.com/readme/local.md',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=local-relay',
    category: 'provider',
    version: '1.0.0',
    publisher: publisher('agent-store'),
    compatibleWith: ['claude', 'codex'],
    tags: ['relay', 'local', '内置'],
    downloads: 0,
    rating: 5.0,
    status: 'published',
    installHook: { steps: [] },
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    configSchema: {},
    supportedModels: [],
  },
  {
    id: 'item-yls-code',
    slug: 'yls',
    name: 'YLS Code 中转',
    description:
      '伊莉思 Code 中转服务，国内直连免翻墙接入 Codex CLI（GPT-5 Code）与 Claude Code；此预设接入其 Codex 端点，按订阅计费。',
    readmeUrl: 'https://docs.ylsagi.io/',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=yls-code',
    category: 'provider',
    version: '1.0.0',
    publisher: publisher('yls-me'),
    compatibleWith: ['codex'],
    tags: ['relay', 'codex', '国产中转'],
    downloads: 32_000,
    rating: 4.7,
    status: 'published',
    installHook: {
      steps: [
        {
          type: 'config',
          patch: {
            apiKey: '',
            baseUrl: 'https://code.ylsagi.com/codex',
            authType: 'bearer',
            upstreamProtocol: 'auto',
            level: 1,
          },
        },
      ],
    },
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    configSchema: {
      type: 'object',
      required: ['apiKey'],
      properties: {
        apiKey: { type: 'string', description: 'API 密钥 (Bearer)' },
        baseUrl: { type: 'string', description: 'API 地址', default: 'https://code.ylsagi.com/codex' },
        authType: { type: 'string', default: 'bearer' },
        upstreamProtocol: { type: 'string', default: 'auto' },
        level: { type: 'number', default: 1 },
      },
    },
    supportedModels: ['gpt-5-codex', 'gpt-5'],
  },
  {
    id: 'item-skyapi',
    slug: 'skyapi',
    name: 'SkyAPI 中转',
    description:
      'SkyAPI 中转服务，稳定线路免翻墙接入 Claude Code，兼容 Cursor / Cline / Windsurf 等客户端。',
    readmeUrl: 'https://www.skyapi.org/docs/zh-CN/',
    icon: 'https://api.dicebear.com/9.x/icons/svg?seed=skyapi',
    category: 'provider',
    version: '1.0.0',
    publisher: publisher('skyapi'),
    compatibleWith: ['claude'],
    tags: ['relay', 'claude', '国产中转'],
    downloads: 21_000,
    rating: 4.5,
    status: 'published',
    installHook: {
      steps: [
        {
          type: 'config',
          patch: {
            apiKey: '',
            baseUrl: 'http://150.158.2.79:8888',
            authType: 'anthropic',
            upstreamProtocol: 'auto',
            level: 1,
          },
        },
      ],
    },
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    configSchema: {
      type: 'object',
      required: ['apiKey'],
      properties: {
        apiKey: { type: 'string', description: 'API 密钥 (x-api-key)' },
        baseUrl: { type: 'string', description: 'API 地址', default: 'http://150.158.2.79:8888' },
        authType: { type: 'string', default: 'anthropic' },
        upstreamProtocol: { type: 'string', default: 'auto' },
        level: { type: 'number', default: 1 },
      },
    },
    supportedModels: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-opus-4-5'],
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
