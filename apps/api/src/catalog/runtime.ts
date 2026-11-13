import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Octokit } from '@octokit/rest'
import { getDb } from '../db/client'
import { FoundStore } from './found-store'
import { CatalogReader } from './reader'
import { searchSources } from './sources'
import { SearchSupplement } from './supplement'
import { CatalogUpdater } from './updater'

/** The catalog the API serves; empty until a catalog.db is opened. */
export const catalogReader = new CatalogReader()

/**
 * CATALOG_URL: where the published catalog.db is downloaded from (unset: only
 * CATALOG_PATH is served, never refreshed). CATALOG_PATH: the local copy.
 * CATALOG_REFRESH_SECONDS: how often to look for a new version.
 */
export function startCatalog(env: Record<string, string | undefined> = process.env): CatalogUpdater | null {
  const path = env['CATALOG_PATH'] || join(tmpdir(), 'agent-store', 'catalog.db')
  const url = env['CATALOG_URL']
  if (!url) {
    try {
      catalogReader.open(path)
    } catch (e) {
      console.warn(JSON.stringify({ level: 'warn', message: 'no CATALOG_URL and no readable CATALOG_PATH', path, error: String(e) }))
    }
    return null
  }
  const updater = new CatalogUpdater({ reader: catalogReader, url, path })
  updater.start(Math.max(Number(env['CATALOG_REFRESH_SECONDS'] ?? '300'), 30) * 1000)
  return updater
}

let supplement: SearchSupplement | null | undefined

/**
 * The search supplement, built on first use; null when it is switched off or app.db
 * cannot be opened.
 * SEARCH_FALLBACK_SOURCES: sites to ask, comma separated (default `clawhub,skillhub`;
 * `none` switches the lookups off; `skillsmp` is opt-in). SEARCH_FALLBACK_MIN_RESULTS and
 * SEARCH_FALLBACK_TIMEOUT_MS override the trigger threshold and the per-site timeout.
 * SKILLSMP_API_KEY: optional key for SkillsMP. GITHUB_TOKEN: optional, raises how many
 * found repos the API may scan per hour.
 */
export function searchSupplement(env: Record<string, string | undefined> = process.env): SearchSupplement | null {
  if (supplement !== undefined) return supplement
  const known = searchSources(env)
  const names = (env['SEARCH_FALLBACK_SOURCES'] ?? 'clawhub,skillhub').split(',').map((s) => s.trim()).filter(Boolean)
  const sources = names.flatMap((n) => known[n] ?? [])
  const unknown = names.filter((n) => n !== 'none' && !known[n])
  if (unknown.length) console.warn(JSON.stringify({ level: 'warn', message: 'unknown SEARCH_FALLBACK_SOURCES entries ignored', unknown }))
  if (sources.length === 0) return (supplement = null)
  try {
    const token = env['GITHUB_TOKEN'] || undefined
    const positive = (raw: string | undefined) => (raw && Number(raw) > 0 ? Number(raw) : undefined)
    const minResults = positive(env['SEARCH_FALLBACK_MIN_RESULTS'])
    const sourceTimeoutMs = positive(env['SEARCH_FALLBACK_TIMEOUT_MS'])
    supplement = new SearchSupplement({
      reader: catalogReader,
      store: new FoundStore(getDb()),
      sources,
      github: new Octokit({ auth: token, userAgent: 'agent-store-api', log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } }),
      config: {
        // Anonymous GitHub API calls are capped at 60 an hour per address; a scan takes two.
        scansPerHour: token ? 200 : 20,
        ...(minResults ? { minResults } : {}),
        ...(sourceTimeoutMs ? { sourceTimeoutMs } : {}),
      },
    })
  } catch (e) {
    console.warn(JSON.stringify({ level: 'warn', message: 'search supplement is off', error: e instanceof Error ? e.message : String(e) }))
    supplement = null
  }
  return supplement
}
