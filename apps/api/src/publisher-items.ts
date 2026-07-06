import type { Item } from '@as/types'
import { getSupabaseAdmin, type SupabaseEnv } from './supabase'
import { mapItem, type DBItem, type DBPublisher } from './db-types'

const ITEM_SELECT = '*, publishers(*)'

export interface CreateItemInput {
  slug: string
  name: string
  description: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  compatibleWith?: string[]
  tags?: string[]
  metadata?: Record<string, unknown>
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

/** Validates a create-item payload; returns an error message + HTTP status, or null when valid. */
export function validateCreateItem(body: CreateItemInput): { error: string; status: number } | null {
  const required: (keyof CreateItemInput)[] = ['slug', 'name', 'description', 'category', 'version']
  for (const field of required) {
    if (!body[field]) return { error: `Missing required field: ${field}`, status: 422 }
  }
  if (!['provider', 'skill', 'mcp'].includes(body.category)) {
    return { error: 'Invalid category', status: 422 }
  }
  if (body.category === 'mcp') {
    const md = readRecord(body.metadata) ?? {}
    const transport = typeof md['transport'] === 'string' ? (md['transport'] as string) : 'stdio'
    if (!['stdio', 'http', 'sse'].includes(transport)) return { error: 'Invalid MCP transport', status: 422 }
    if (transport === 'stdio' && typeof md['serverCommand'] !== 'string') return { error: 'Missing MCP serverCommand', status: 422 }
    if ((transport === 'http' || transport === 'sse') && typeof md['url'] !== 'string') return { error: 'Missing MCP url', status: 422 }
  }
  return null
}

async function resolvePublisherId(supabase: ReturnType<typeof getSupabaseAdmin>, username: string): Promise<string | null> {
  const { data } = await supabase.from('publishers').select('id').eq('slug', username).limit(1).maybeSingle()
  return data ? (data as { id: string }).id : null
}

/** Returns all items for the authenticated publisher (any status), newest first. */
export async function getMyItems(env: SupabaseEnv | undefined, username: string): Promise<{ data: Item[]; error: string | null }> {
  const supabase = getSupabaseAdmin(env)
  const publisherId = await resolvePublisherId(supabase, username)
  if (!publisherId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('items')
    .select(ITEM_SELECT)
    .eq('publisher_id', publisherId)
    .order('created_at', { ascending: false })
  if (error) return { data: [], error: (error as { message?: string }).message ?? 'Query failed' }
  const rows = (data ?? []) as Array<DBItem & { publishers: DBPublisher }>
  return { data: rows.map(mapItem), error: null }
}

/** Inserts a pending item owned by the authenticated publisher. */
export async function createItem(
  env: SupabaseEnv | undefined,
  username: string,
  body: CreateItemInput
): Promise<{ ok: true } | { error: string; status: number }> {
  const supabase = getSupabaseAdmin(env)
  const publisherId = await resolvePublisherId(supabase, username)
  if (!publisherId) return { error: 'Publisher profile not found. Please create one first.', status: 422 }

  const { error } = await supabase.from('items').insert({
    slug: body.slug,
    name: body.name,
    description: body.description,
    category: body.category,
    version: body.version,
    publisher_id: publisherId,
    compatible_with: body.compatibleWith ?? [],
    tags: body.tags ?? [],
    install_hook: { steps: [] },
    metadata: body.metadata ?? {},
    status: 'pending',
  })
  if (error) {
    if ((error as { code?: string }).code === '23505') return { error: 'An item with this slug already exists', status: 409 }
    return { error: 'Failed to create item', status: 500 }
  }
  return { ok: true }
}
