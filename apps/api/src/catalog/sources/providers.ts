import type { ProviderResourceDetail, ResourceAuthor, ResourceSummary } from '@as/types'
import type { CatalogRecord, CatalogSource } from '../types'

// There is no upstream directory of model providers; these are curated here.
// Bump `version` when an entry changes so clients see an update.

interface BuiltinProvider extends Omit<ProviderResourceDetail, keyof ResourceSummary> {
  id: string
  name: string
  description: string
  version: string
  author: ResourceAuthor
  homepageUrl: string | null
  tags: string[]
}

const apiKeySchema = (description: string, connection: { baseUrl: string; authType: string; upstreamProtocol?: string; level?: number }) => ({
  type: 'object',
  required: ['apiKey'],
  properties: {
    apiKey: { type: 'string', description, 'x-secret': true },
    baseUrl: { type: 'string', description: 'API 地址', default: connection.baseUrl },
    authType: { type: 'string', default: connection.authType },
    ...(connection.upstreamProtocol ? { upstreamProtocol: { type: 'string', default: connection.upstreamProtocol } } : {}),
    level: { type: 'number', default: connection.level ?? 1 },
  },
})

export const BUILTIN_PROVIDERS: BuiltinProvider[] = [
  {
    id: 'local',
    name: 'local',
    description: '内置本地转发：将 Claude Code / Codex 的 baseURL 指向本机监听端口，请求按 Level 优先级转发到已配置的上游供应商，失败自动降级。无需 API 密钥。',
    version: '1.0.0',
    author: { name: 'Agent Store', url: null },
    homepageUrl: null,
    tags: ['relay', 'local'],
    compatibleWith: ['claude', 'codex'],
    connection: null,
    configSchema: {},
    supportedModels: [],
  },
  {
    id: 'yls',
    name: 'YLS Code',
    description: '伊莉思 Code 服务，国内直连免翻墙接入 Codex CLI（GPT-5 Code）与 Claude Code；此预设接入其 Codex 端点，按订阅计费。',
    version: '1.0.0',
    author: { name: 'YLS.me', url: 'https://code.ylsagi.com' },
    homepageUrl: 'https://code.ylsagi.com',
    tags: ['relay', 'codex'],
    compatibleWith: ['codex'],
    connection: { baseUrl: 'https://code.ylsagi.com/codex', authType: 'bearer', upstreamProtocol: 'auto', level: 1 },
    configSchema: apiKeySchema('API 密钥 (Bearer)', { baseUrl: 'https://code.ylsagi.com/codex', authType: 'bearer', upstreamProtocol: 'auto' }),
    supportedModels: ['gpt-5-codex', 'gpt-5'],
  },
  {
    id: 'skyapi',
    name: 'SkyAPI',
    description: 'SkyAPI 服务，稳定线路免翻墙接入 Claude Code，兼容 Cursor / Cline / Windsurf 等客户端。',
    version: '1.0.0',
    author: { name: 'SkyAPI', url: null },
    homepageUrl: null,
    tags: ['relay', 'claude'],
    compatibleWith: ['claude'],
    connection: { baseUrl: 'http://150.158.2.79:8888', authType: 'anthropic', upstreamProtocol: 'auto', level: 1 },
    configSchema: apiKeySchema('API 密钥 (x-api-key)', { baseUrl: 'http://150.158.2.79:8888', authType: 'anthropic', upstreamProtocol: 'auto' }),
    supportedModels: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-opus-4-5'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'OpenRouter：一个 API Key 访问 300+ 模型（OpenAI 兼容）。此预设已填好接入地址，你只需填入自己的 OpenRouter API Key。',
    version: '1.0.0',
    author: { name: 'OpenRouter', url: 'https://openrouter.ai' },
    homepageUrl: 'https://openrouter.ai',
    tags: ['router', 'openai-compatible'],
    compatibleWith: ['codex'],
    connection: { baseUrl: 'https://openrouter.ai/api/v1', authType: 'bearer', endpointPath: '/chat/completions', upstreamProtocol: 'auto', level: 1 },
    configSchema: apiKeySchema('OpenRouter API Key (Bearer)', { baseUrl: 'https://openrouter.ai/api/v1', authType: 'bearer' }),
    supportedModels: [
      'tencent/hy3:free',
      'tencent/hy3',
      'poolside/laguna-xs-2.1:free',
      'poolside/laguna-xs-2.1',
      'anthropic/claude-sonnet-5',
      'google/gemini-3.1-flash-lite-image',
      'nex-agi/nex-n2-mini',
      'sakana/fugu-ultra',
      'google/gemini-3.1-flash-image',
      'google/gemini-3-pro-image',
      'cohere/north-mini-code:free',
      'z-ai/glm-5.2',
      'openrouter/fusion',
      'moonshotai/kimi-k2.7-code',
      '~anthropic/claude-fable-latest',
      'anthropic/claude-fable-5',
      'nex-agi/nex-n2-pro',
      'nvidia/nemotron-3.5-content-safety:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'nvidia/nemotron-3-ultra-550b-a55b',
    ],
  },
]

export function providerRecord(p: BuiltinProvider): CatalogRecord {
  const { id, name, description, version, author, homepageUrl, tags, ...detail } = p
  return {
    kind: 'provider',
    site: 'builtin',
    upstreamId: id,
    name,
    description,
    author,
    version,
    homepageUrl,
    installs: null,
    verified: true,
    tags,
    transports: [],
    sourceUrl: null,
    upstreamVersion: version,
    upstreamUpdatedAt: null,
    scope: null,
    detail,
  }
}

export function builtinProvidersSource(list: BuiltinProvider[] = BUILTIN_PROVIDERS): CatalogSource {
  return {
    name: 'builtin-providers',
    site: 'builtin',
    kind: 'provider',
    async run() {
      return { records: list.map(providerRecord), removed: [], skipped: {}, errors: [], coverage: { mode: 'full' } }
    },
  }
}
