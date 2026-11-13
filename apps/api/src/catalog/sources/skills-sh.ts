import type { DiscoveryRun, DiscoverySource, Metric, Observation } from '../discovery'
import { describeError, isRateLimited, isRecord, str } from '../http'
import { githubRepoOf } from '../stars'
import { addSkip } from '../types'

// skills.sh's /api/v1 needs a Vercel OIDC token and robots.txt disallows /api/, so the
// three leaderboard pages are read instead. Each page embeds its first 600 entries in
// the Next.js flight payload as `"initialSkills":[…]`, followed by the board's
// `totalSkills`; deeper entries are only reachable through the API.
export const SKILLS_SH_URL = 'https://skills.sh'

interface Board {
  board: string
  path: string
  metrics: (e: Record<string, unknown>) => Partial<Record<Metric, number>>
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : undefined)

const BOARDS: Board[] = [
  { board: 'all-time', path: '/', metrics: (e) => ({ installs_total: count(e['installs']) }) },
  // The tab says "Trending (24h)"; the page title says "This Week". The window is the site's.
  { board: 'trending', path: '/trending', metrics: (e) => ({ installs_window: count(e['installs']) }) },
  { board: 'hot', path: '/hot', metrics: (e) => ({ installs_hour: count(e['installs']), installs_hour_change: count(e['change']) }) },
]

const PUSH = /self\.__next_f\.push\((\[1,"(?:[^"\\]|\\.)*"\])\)/g

/** End index of the JSON array or object starting at `start`, skipping brackets inside strings. */
function closingBracket(text: string, start: number): number {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '[' || c === '{') depth++
    else if (c === ']' || c === '}') {
      if (--depth === 0) return i
    }
  }
  return -1
}

/** The entries a leaderboard page embeds, or null when the page no longer has them where expected. */
export function parseLeaderboard(html: string): { entries: Record<string, unknown>[]; total: number | null } | null {
  let payload = ''
  for (const m of html.matchAll(PUSH)) {
    try {
      payload += (JSON.parse(m[1]!) as [number, string])[1]
    } catch {
      // Not a flight chunk.
    }
  }
  const key = '"initialSkills":'
  const at = payload.indexOf(key)
  if (at < 0) return null
  const start = at + key.length
  const end = closingBracket(payload, start)
  if (end < 0) return null
  let entries: unknown
  try {
    entries = JSON.parse(payload.slice(start, end + 1))
  } catch {
    return null
  }
  if (!Array.isArray(entries)) return null
  const total = /^,"totalSkills":(\d+)/.exec(payload.slice(end + 1, end + 40))
  return { entries: entries.filter(isRecord), total: total ? Number(total[1]) : null }
}

export function skillsShSource(options: { baseUrl?: string } = {}): DiscoverySource {
  const base = options.baseUrl ?? SKILLS_SH_URL
  return {
    name: 'skills-sh',
    async run(ctx): Promise<DiscoveryRun> {
      const run: DiscoveryRun = { observations: [], coverage: [], skipped: {}, errors: [] }
      for (const b of BOARDS) {
        let html: string
        try {
          html = await ctx.http.get(new URL(b.path, base).toString(), { headers: { accept: 'text/html' } }).text()
        } catch (e) {
          run.errors.push(`${b.board}: ${describeError(e)}`)
          run.coverage.push({ list: b.board, pages: 0, items: 0, total: null, stoppedBy: isRateLimited(e) ? 'rate-limited' : 'error' })
          continue
        }
        const parsed = parseLeaderboard(html)
        if (!parsed) {
          run.errors.push(`${b.board}: leaderboard data not found in the page`)
          run.coverage.push({ list: b.board, pages: 1, items: 0, total: null, stoppedBy: 'error' })
          continue
        }
        let rank = 0
        for (const e of parsed.entries) {
          rank++
          const source = str(e['source'])
          const skillId = str(e['skillId'])
          // Entries from well-known URLs rather than GitHub have a domain as their source.
          const repo = source ? githubRepoOf(`https://github.com/${source}`) : null
          if (!repo || !skillId || source!.split('/').length !== 2) {
            addSkip(run.skipped, 'not a GitHub skill')
            continue
          }
          const listingId = `${repo}/${skillId.toLowerCase()}`
          const metrics = Object.fromEntries(Object.entries(b.metrics(e)).filter(([, v]) => v !== undefined)) as Observation['metrics']
          run.observations.push({
            listingId,
            skillKey: `github:${listingId}`,
            name: str(e['name']) ?? skillId,
            url: `${base}/${source}/${skillId}`,
            githubRepo: repo,
            board: b.board,
            rank,
            metrics,
          })
        }
        const items = parsed.entries.length
        run.coverage.push({
          list: b.board, pages: 1, items, total: parsed.total,
          stoppedBy: parsed.total !== null && items >= parsed.total ? 'end' : 'site-limit',
        })
      }
      return run
    },
  }
}
