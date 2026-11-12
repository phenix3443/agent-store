// A catalog resource becomes the item manifest the adapters install from
// (manifest.json, or the skill marker). The API keeps the upstream structure;
// deciding how to install it happens here.
import type { BaseItem, Item, MCPItem, ProviderItem, ResourceDetail, SkillItem, ToolTarget } from '@as/types'
import { planMcp } from './mcp-plan'

const BOTH: ToolTarget[] = ['claude', 'codex']

function base(r: ResourceDetail, slug: string): Omit<BaseItem, 'category' | 'compatibleWith'> {
  const when = r.origin.upstreamUpdatedAt ?? r.origin.syncedAt
  const author = r.author?.name ?? r.origin.site
  return {
    id: r.id,
    resourceId: r.id,
    slug,
    name: r.name,
    description: r.description ?? '',
    version: r.version ?? r.origin.upstreamVersion ?? '0.0.0',
    publisher: {
      id: author,
      slug: author.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      name: author,
      avatarUrl: '',
      tier: r.verified ? 'verified' : 'community',
    },
    tags: r.tags,
    downloads: r.installs ?? 0,
    rating: 0,
    status: 'published',
    installHook: { steps: [] },
    createdAt: when,
    updatedAt: when,
  }
}

export function toItem(r: ResourceDetail, slug: string): Item {
  if (r.kind === 'skill') {
    const skillMd = r.files.find(f => f.path === 'SKILL.md')
    const item: SkillItem = {
      ...base(r, slug),
      category: 'skill',
      compatibleWith: BOTH,
      contentUrl: skillMd?.downloadUrl ?? '',
      source: { repo: r.repo.fullName, ref: r.repo.commit, dir: r.repo.dir },
      files: r.files,
    }
    return item
  }

  if (r.kind === 'provider') {
    const c = r.connection
    const item: ProviderItem = {
      ...base(r, slug),
      category: 'provider',
      compatibleWith: r.compatibleWith,
      configSchema: r.configSchema,
      supportedModels: r.supportedModels,
      // The defaults config.json starts from; values the user already set win (hook-runner).
      installHook: c
        ? {
            steps: [{
              type: 'config',
              patch: {
                baseUrl: c.baseUrl,
                authType: c.authType,
                ...(c.endpointPath !== undefined ? { endpointPath: c.endpointPath } : {}),
                ...(c.upstreamProtocol !== undefined ? { upstreamProtocol: c.upstreamProtocol } : {}),
                ...(c.level !== undefined ? { level: c.level } : {}),
                apiKey: '',
              },
            }],
          }
        : { steps: [] },
    }
    return item
  }

  const plan = planMcp(r, slug)
  const common = { ...base(r, slug), category: 'mcp' as const, compatibleWith: BOTH, configSchema: plan.configSchema, templated: true }
  const item: MCPItem = plan.transport === 'stdio'
    ? { ...common, transport: 'stdio', serverCommand: [plan.command, ...plan.args].join(' '), command: plan.command, args: plan.args, ...(Object.keys(plan.env).length ? { env: plan.env } : {}) }
    : { ...common, transport: plan.transport, url: plan.url, ...(Object.keys(plan.headers).length ? { headers: plan.headers } : {}) }
  return item
}
