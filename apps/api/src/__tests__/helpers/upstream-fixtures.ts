import { readFileSync } from 'node:fs'
import { Octokit } from '@octokit/rest'

const dir = new URL('../fixtures/upstream/', import.meta.url).pathname

export const fixtureText = (name: string) => readFileSync(dir + name, 'utf-8')
export const fixtureJson = <T = any>(name: string): T => JSON.parse(fixtureText(name)) as T

export type Route = (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined

/** A fetch that answers from routes and fails the test on anything unrouted: no network in unit tests. */
export function fakeFetch(...routes: Route[]): typeof fetch & { calls: string[] } {
  const calls: string[] = []
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    calls.push(url.toString())
    for (const route of routes) {
      const res = await route(url, init)
      if (res) return res
    }
    throw new Error(`unrouted request in test: ${url}`)
  }) as typeof fetch & { calls: string[] }
  f.calls = calls
  return f
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A fetch whose requests never answer until their signal aborts. */
export const hangingFetch = (() =>
  ((_input: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })) as typeof fetch)

export const ANTHROPIC_SKILLS_SHA = fixtureJson<{ sha: string }>('github-anthropics-skills-commit.json').sha

/** Serves anthropics/skills at the recorded commit; other repos 404. */
export const githubRoutes: Route = (url) => {
  if (url.hostname === 'api.github.com') {
    if (url.pathname === '/repos/anthropics/skills/commits/HEAD') return new Response(ANTHROPIC_SKILLS_SHA)
    if (url.pathname === `/repos/anthropics/skills/git/trees/${ANTHROPIC_SKILLS_SHA}`) return json(fixtureJson('github-anthropics-skills-tree.json'))
    return json({ message: 'Not Found' }, 404)
  }
  if (url.hostname === 'raw.githubusercontent.com') {
    const prefix = `/anthropics/skills/${ANTHROPIC_SKILLS_SHA}/`
    if (!url.pathname.startsWith(prefix)) return new Response('404', { status: 404 })
    const path = decodeURIComponent(url.pathname.slice(prefix.length))
    if (path === 'skills/frontend-design/SKILL.md') return new Response(fixtureText('github-anthropics-skills-frontend-design-SKILL.md'))
    // The recording holds one SKILL.md; the others get a minimal valid one.
    const name = path.split('/').at(-2)
    return new Response(`---\nname: ${name}\ndescription: ${name} skill\n---\n\n# ${name}\n`)
  }
  return undefined
}

export function octokitWith(fetchImpl: typeof fetch): Octokit {
  return new Octokit({ request: { fetch: fetchImpl, retries: 0 } })
}

/**
 * Answers POST api.github.com/graphql star queries from `stars` (lowercase
 * owner/name); repos not listed resolve to null with a NOT_FOUND error, as GitHub does.
 * `queries` records the repos of each query.
 */
export function githubGraphqlRoute(stars: Record<string, number>): Route & { queries: string[][] } {
  const queries: string[][] = []
  const route = ((url: URL, init?: RequestInit) => {
    if (url.hostname !== 'api.github.com' || url.pathname !== '/graphql') return undefined
    const { query } = JSON.parse(String(init?.body)) as { query: string }
    const repos = [...query.matchAll(/(r\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)].map((m) => ({
      alias: m[1]!,
      full: `${m[2]}/${m[3]}`.toLowerCase(),
    }))
    queries.push(repos.map((r) => r.full))
    const data: Record<string, unknown> = { rateLimit: { limit: 1000, cost: 1, remaining: 1000 - queries.length, resetAt: '2026-11-12T01:00:00Z' } }
    const errors: unknown[] = []
    for (const r of repos) {
      if (r.full in stars) data[r.alias] = { stargazerCount: stars[r.full] }
      else {
        data[r.alias] = null
        errors.push({ type: 'NOT_FOUND', path: [r.alias], message: `Could not resolve to a Repository with the name '${r.full}'.` })
      }
    }
    return json(errors.length ? { data, errors } : { data })
  }) as Route & { queries: string[][] }
  route.queries = queries
  return route
}
