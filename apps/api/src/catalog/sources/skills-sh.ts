import { getJson, isRecord, str } from '../http'

// skills.sh has no documented API. Its search endpoint is used only to discover
// source repos and install counts; any failure leaves discovery empty.
export const SKILLS_SH_URL = 'https://skills.sh'

/** Search terms whose results seed the repo list; skills.sh needs at least 2 characters. */
export const DISCOVERY_QUERIES = [
  'frontend', 'react', 'design', 'test', 'git', 'python', 'typescript', 'docs',
  'api', 'database', 'security', 'deploy', 'debug', 'review', 'writing', 'data',
  'cloud', 'agent', 'mcp', 'web', 'mobile', 'pdf', 'marketing', 'seo', 'code',
]

export interface SkillsShDiscovery {
  /** `owner/repo` (lowercase) → summed installs of its skills seen in the results. */
  repos: Map<string, { fullName: string; installs: number }>
  /** `owner/repo/skillId` (lowercase) → installs. */
  installs: Map<string, number>
  errors: string[]
}

export async function discoverFromSkillsSh(
  fetchImpl: typeof fetch,
  options: { baseUrl?: string; queries?: string[]; limit?: number; timeoutMs?: number } = {},
): Promise<SkillsShDiscovery> {
  const base = options.baseUrl ?? SKILLS_SH_URL
  const out: SkillsShDiscovery = { repos: new Map(), installs: new Map(), errors: [] }
  for (const q of options.queries ?? DISCOVERY_QUERIES) {
    const url = new URL('/api/search', base)
    url.searchParams.set('q', q)
    url.searchParams.set('limit', String(options.limit ?? 200))
    let body: unknown
    try {
      body = await getJson(fetchImpl, url.toString(), `skills.sh search "${q}"`, options.timeoutMs ?? 10_000)
    } catch (e) {
      out.errors.push(e instanceof Error ? e.message : String(e))
      // A dead or rate-limiting service would fail every remaining query the same way.
      if (out.errors.length >= 3 && out.installs.size === 0) break
      continue
    }
    if (!isRecord(body) || !Array.isArray(body['skills'])) {
      out.errors.push(`skills.sh search "${q}": unexpected response shape`)
      continue
    }
    for (const s of body['skills']) {
      if (!isRecord(s)) continue
      const source = str(s['source'])
      const skillId = str(s['skillId'])
      if (!source || !skillId || !/^[\w.-]+\/[\w.-]+$/.test(source)) continue
      const installs = typeof s['installs'] === 'number' && s['installs'] >= 0 ? Math.floor(s['installs']) : 0
      const key = `${source.toLowerCase()}/${skillId.toLowerCase()}`
      if (out.installs.has(key)) continue
      out.installs.set(key, installs)
      const repo = out.repos.get(source.toLowerCase()) ?? { fullName: source, installs: 0 }
      repo.installs += installs
      out.repos.set(source.toLowerCase(), repo)
    }
  }
  return out
}
