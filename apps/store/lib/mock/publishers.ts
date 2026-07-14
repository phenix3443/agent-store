import type { Publisher } from '@as/types'

export const MOCK_PUBLISHERS: Publisher[] = [
  {
    id: 'pub-anthropic',
    slug: 'anthropic',
    name: 'Anthropic',
    avatarUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=anthropic',
    tier: 'official',
    bio: '构建 Claude 与 Claude Code 的团队官方发布。',
  },
  {
    id: 'pub-openai',
    slug: 'openai',
    name: 'OpenAI',
    avatarUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=openai',
    tier: 'official',
    bio: 'GPT 系列模型的官方供应商配置。',
  },
  {
    id: 'pub-yls',
    slug: 'yls-me',
    name: 'YLS.me',
    avatarUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=yls',
    tier: 'verified',
    bio: '已验证的第三方模型接入服务。',
  },
  {
    id: 'pub-community-fox',
    slug: 'devfox',
    name: 'devfox',
    avatarUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=devfox',
    tier: 'community',
    bio: '独立开发者，专注前端工具技能。',
  },
  {
    id: 'pub-agent-store',
    slug: 'agent-store',
    name: 'Agent Store',
    avatarUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=agent-store',
    tier: 'official',
    bio: 'Agent Store 官方内置组件。',
  },
  {
    id: 'pub-skyapi',
    slug: 'skyapi',
    name: 'SkyAPI',
    avatarUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=skyapi',
    tier: 'community',
    bio: '稳定线路、免翻墙接入 Claude Code 的第三方接入服务。',
  },
]

export function getPublisherBySlug(slug: string): Publisher | null {
  return MOCK_PUBLISHERS.find((p) => p.slug === slug) ?? null
}
