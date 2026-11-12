import { homedir } from 'os'
import { join } from 'path'
import type { Paths } from '@as/types'

/** Agent Store's own home before 2026-11-12; `~/.agents` is a convention directory other tools read too. */
export function legacyAasHome(): string {
  return join(process.env['HOME'] || homedir(), '.agents')
}

export function resolvePaths(overrides?: Partial<Paths>): Required<Paths> {
  const home = homedir()
  // Claude Code keeps user-scope MCP servers in `.claude.json`, which sits at
  // $CLAUDE_CONFIG_DIR/.claude.json when that dir is set, otherwise $HOME/.claude.json.
  const claudeDirSet = overrides?.claudeConfigDir ?? process.env['CLAUDE_CONFIG_DIR']
  return {
    aasHome: overrides?.aasHome ?? process.env['AS_HOME'] ?? join(home, '.agent-store'),
    claudeConfigDir: overrides?.claudeConfigDir ?? process.env['CLAUDE_CONFIG_DIR'] ?? join(home, '.claude'),
    claudeJsonPath: overrides?.claudeJsonPath ?? join(claudeDirSet ?? home, '.claude.json'),
    // Codex reads CODEX_HOME; CODEX_CONFIG_DIR is this project's older name for it.
    codexConfigDir: overrides?.codexConfigDir ?? (process.env['CODEX_HOME'] || process.env['CODEX_CONFIG_DIR'] || join(home, '.codex')),
  }
}

export type Category = 'provider' | 'skill' | 'mcp'

const CATEGORY_DIR: Record<Category, string> = {
  provider: 'providers',
  skill: 'skills',
  mcp: 'mcps',
}

export class InvalidSlugError extends Error {
  readonly reason = 'invalid-slug'
  constructor(readonly slug: string) {
    super(`Invalid slug ${JSON.stringify(slug)}: use letters, digits, ".", "_" and "-", starting with a letter or digit`)
    this.name = 'InvalidSlugError'
  }
}

// Slugs come from the catalog, registry.json and package manifests, and every one of
// them becomes a path segment. A leading letter or digit rules out "", "." and "..";
// no "/" or "\" rules out leaving the parent directory.
const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

export function assertSafeSlug(slug: string): string {
  if (typeof slug !== 'string' || !SAFE_SLUG.test(slug)) throw new InvalidSlugError(String(slug))
  return slug
}

export function itemDir(aasHome: string, category: Category, slug: string): string {
  return join(aasHome, CATEGORY_DIR[category], assertSafeSlug(slug))
}
