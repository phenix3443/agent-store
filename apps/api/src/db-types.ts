import type {
  Publisher,
  Item,
  ProviderItem,
  SkillItem,
  SkillSource,
  MCPItem,
  InstallHook,
} from '@as/types'
import type { items, publishers } from './db/schema'

// ── Raw DB row shapes (Drizzle-inferred from the Neon schema) ─────────────────
// Drizzle returns numeric columns as strings and timestamptz as Date objects;
// the mappers below normalize those to the numbers / ISO strings the API emits.

export type DBPublisher = typeof publishers.$inferSelect
export type DBItem = typeof items.$inferSelect

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(v => typeof v === 'string') ? value as string[] : undefined
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value)
  if (entries.some(([, item]) => typeof item !== 'string')) return undefined
  return Object.fromEntries(entries) as Record<string, string>
}

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

/**
 * `metadata.source` → the skill's directory. The registry stores `path`, which
 * may point at the SKILL.md file itself; it is normalized to its directory.
 * Anything unsafe or malformed drops the field rather than being guessed.
 */
export function readSkillSource(value: unknown): SkillSource | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const { repo, ref, path } = value as Record<string, unknown>
  if (typeof repo !== 'string' || !REPO_RE.test(repo)) return undefined
  if (typeof ref !== 'string' || ref === '') return undefined
  if (typeof path !== 'string') return undefined
  if (path.startsWith('/') || path.includes('\\')) return undefined
  const segments = path.split('/').filter(s => s !== '' && s !== '.')
  if (segments.includes('..')) return undefined
  if (segments.at(-1) === 'SKILL.md') segments.pop()
  return { repo, ref, dir: segments.join('/') }
}

// ── Mapping functions ─────────────────────────────────────────────────────────

export function mapPublisher(row: DBPublisher): Publisher {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    avatarUrl: row.avatarUrl,
    tier: row.tier as Publisher['tier'],
    ...(row.bio !== null ? { bio: row.bio } : {}),
  }
}

export function mapItem(row: DBItem & { publisher: DBPublisher }): Item {
  const publisher = mapPublisher(row.publisher)
  const metadata = (row.metadata ?? {}) as Record<string, unknown>
  const base = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    version: row.version,
    publisher,
    compatibleWith: row.compatibleWith as ('claude' | 'codex')[],
    tags: row.tags,
    downloads: row.downloads,
    rating: Number(row.rating),
    reviewCount: row.reviewCount ?? 0,
    status: row.status as Item['status'],
    installHook: (row.installHook ?? { steps: [] }) as InstallHook,
    review: (metadata['review'] as import('@as/types').PackageReview | undefined) ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }

  if (row.category === 'provider') {
    return {
      ...base,
      category: 'provider',
      configSchema: (metadata['configSchema'] ?? {}) as Record<string, unknown>,
      supportedModels: (metadata['supportedModels'] ?? []) as string[],
    } satisfies ProviderItem
  }

  if (row.category === 'skill') {
    // registry sync tags rows with metadata.source = 'registry' | 'crawler' and
    // keeps the manifest's source object under skillSource.
    const source = readSkillSource(metadata['skillSource'] ?? metadata['source'])
    return {
      ...base,
      category: 'skill',
      contentUrl: (metadata['contentUrl'] ?? '') as string,
      ...(source ? { source } : {}),
    } satisfies SkillItem
  }

  // mcp
  const transport = (metadata['transport'] ?? 'stdio') as 'stdio' | 'sse' | 'http'
  if (transport === 'http' || transport === 'sse') {
    return {
      ...base,
      category: 'mcp',
      transport,
      url: readString(metadata['url']) ?? '',
      ...(readStringRecord(metadata['headers']) ? { headers: readStringRecord(metadata['headers']) } : {}),
      configSchema: (metadata['configSchema'] ?? {}) as Record<string, unknown>,
    } satisfies MCPItem
  }

  const command = readString(metadata['command'])
  const args = readStringArray(metadata['args'])
  return {
    ...base,
    category: 'mcp',
    transport,
    serverCommand: readString(metadata['serverCommand']) ?? '',
    ...(command ? { command, args: args ?? [] } : {}),
    configSchema: (metadata['configSchema'] ?? {}) as Record<string, unknown>,
  } satisfies MCPItem
}
