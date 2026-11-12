import type { Category } from '../paths'
import { McpAdapter } from './mcp'
import { ProviderAdapter } from './provider'
import { SkillAdapter } from './skill'
import type { AdapterContext, KindAdapter } from './types'

export type { AdapterContext, KindAdapter } from './types'
export { ProviderNotReadyError } from './provider'

/** A new kind of item is one more entry here and one adapter file. */
export function createAdapters(ctx: AdapterContext): Record<Category, KindAdapter> {
  return {
    mcp: new McpAdapter(ctx),
    provider: new ProviderAdapter(ctx),
    skill: new SkillAdapter(ctx),
  }
}
