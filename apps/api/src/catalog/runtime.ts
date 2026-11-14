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

/**
 * Builds the search supplement from the environment; null when it is off.
 * SEARCH_FALLBACK_SOURCES: sites to ask, comma separated. Unset, empty or `none` means
 * off: no site is ever called. `clawhub,skillhub,skillsmp` switches every site on.
 * SEARCH_FALLBACK_MIN_RESULTS and SEARCH_FALLBACK_TIMEOUT_MS override the trigger
 * threshold and the per-site timeout. SKILLSMP_API_KEY: optional key for SkillsMP.
 * GITHUB_TOKEN: optional, raises how many found repos the API may scan per hour.
 */
export function buildSearchSupplement(
  env: Record<string, string | undefined> = process.env,
  deps: { reader?: CatalogReader; fetch?: typeof fetch } = {},
): SearchSupplement | null {
  const known = searchSources(env)
  const names = (env['SEARCH_FALLBACK_SOURCES'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const sources = names.flatMap((n) => known[n] ?? [])
  const unknown = names.filter((n) => n !== 'none' && !known[n])
  if (unknown.length) console.warn(JSON.stringify({ level: 'warn', message: 'unknown SEARCH_FALLBACK_SOURCES entries ignored', unknown }))
  if (sources.length === 0) return null
  try {
    const token = env['GITHUB_TOKEN'] || undefined
    const positive = (raw: string | undefined) => (raw && Number(raw) > 0 ? Number(raw) : undefined)
    const minResults = positive(env['SEARCH_FALLBACK_MIN_RESULTS'])
    const sourceTimeoutMs = positive(env['SEARCH_FALLBACK_TIMEOUT_MS'])
    const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
    return new SearchSupplement({
      reader: deps.reader ?? catalogReader,
      store: new FoundStore(getDb(env['APP_DB_PATH'] ? { APP_DB_PATH: env['APP_DB_PATH'] } : undefined)),
      sources,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
      github: new Octokit({ auth: token, userAgent: 'agent-store-api', log: silent, ...(deps.fetch ? { request: { fetch: deps.fetch } } : {}) }),
      config: {
        // Anonymous GitHub API calls are capped at 60 an hour per address; a scan takes two.
        scansPerHour: token ? 200 : 20,
        ...(minResults ? { minResults } : {}),
        ...(sourceTimeoutMs ? { sourceTimeoutMs } : {}),
      },
    })
  } catch (e) {
    console.warn(JSON.stringify({ level: 'warn', message: 'search supplement is off', error: e instanceof Error ? e.message : String(e) }))
    return null
  }
}

let supplement: SearchSupplement | null | undefined

/** The process's search supplement, built on first use. */
export function searchSupplement(): SearchSupplement | null {
  if (supplement === undefined) supplement = buildSearchSupplement()
  return supplement
}
