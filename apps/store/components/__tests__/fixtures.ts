import type { Item, PackageReview } from '@as/types'

export const providerItem: Item = {
  id: 'item-1',
  slug: 'openai-provider',
  name: 'OpenAI Provider',
  description: 'OpenAI API provider with GPT-4o support',
  category: 'provider',
  version: '1.2.0',
  publisher: { id: 'pub-1', slug: 'openai', name: 'OpenAI', avatarUrl: '', tier: 'official' },
  compatibleWith: ['claude', 'codex'],
  tags: ['ai', 'openai'],
  downloads: 1_200_000,
  rating: 0,
  reviewCount: 0,
  status: 'published',
  installHook: { steps: [] },
  createdAt: '2026-06-18T00:00:00Z',
  updatedAt: '2026-06-18T00:00:00Z',
  configSchema: {},
  supportedModels: ['gpt-4o'],
}

export const mcpItem: Item = {
  ...providerItem,
  id: 'item-2',
  slug: 'anki-mcp',
  name: 'Anki MCP',
  description: 'Read and write Anki cards',
  category: 'mcp',
  publisher: { id: 'pub-2', slug: 'ankimcp', name: 'ankimcp', avatarUrl: '', tier: 'community' },
  downloads: 370,
  transport: 'stdio',
  serverCommand: 'npx -y @ankimcp/anki-mcp-server',
}

export const cleanReview: PackageReview = {
  tier: 'auto',
  quality: 4,
  risk: 'low',
  summary: 'Does what the manifest says.',
  concerns: [],
}

export const flaggedReview: PackageReview = {
  tier: 'auto',
  quality: 3,
  risk: 'medium',
  summary: 'Runs third-party code.',
  concerns: ['Downloads and runs code through npx'],
}
