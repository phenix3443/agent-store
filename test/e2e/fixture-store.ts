// A stand-in for the Agent Store API and the GitHub endpoints a skill install
// reads, for offline tests. Items are written as DB rows and go through the
// API's own `mapItem`, so a test can only see fields production returns.
//
// Routes:
//   GET  /api/items, /api/items/:slug, POST /api/items/:slug/install
//   GET  /files/<path>                              static files (contentUrl, file steps)
//   GET  /github-api/repos/:owner/:repo/commits/:ref  → { sha }      (AS_GITHUB_API_URL)
//   GET  /codeload/:owner/:repo/tar.gz/:sha           → repo tarball (AS_CODELOAD_URL)
import { spawnSync } from 'child_process'
import { createHash } from 'crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { mapItem } from '../../apps/api/src/db-types'

type DbRow = Parameters<typeof mapItem>[0]

export interface FixturePublisher {
  slug: string
  name: string
  tier: 'official' | 'verified' | 'community'
}

/** A package as the registry describes it (metadata stays raw, as in the DB). */
export interface FixturePackage {
  slug: string
  name: string
  description: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  compatibleWith: Array<'claude' | 'codex'>
  installHook?: { steps: unknown[] }
  metadata: Record<string, unknown>
}

/** A fake GitHub repo served through the commits API and codeload. */
export interface FixtureRepo {
  /** `owner/name` */
  repo: string
  /** Branch name resolved by the commits API. */
  ref: string
  /** Directory whose contents become the repo root. */
  dir: string
}

export interface FixtureStoreOptions {
  port?: number
  publisher: FixturePublisher
  /** Built from the base URL once the port is known. */
  packages: (baseUrl: string) => FixturePackage[]
  /** URL path under /files/ → absolute file path. */
  files?: Record<string, string>
  repos?: FixtureRepo[]
}

export interface FixtureStore {
  url: string
  githubApiUrl: string
  codeloadUrl: string
  /** Resolved commit SHA per `owner/name`. */
  shas: Record<string, string>
  stop(): void
}

function toRow(pkg: FixturePackage, publisher: FixturePublisher): DbRow {
  const now = new Date('2026-10-22T00:00:00Z')
  const publisherId = `pub-${publisher.slug}`
  return {
    id: `item-${pkg.slug}`,
    slug: pkg.slug,
    name: pkg.name,
    description: pkg.description,
    category: pkg.category,
    version: pkg.version,
    publisherId,
    compatibleWith: pkg.compatibleWith,
    tags: [pkg.category, 'fixture'],
    downloads: 0,
    rating: '0',
    reviewCount: 0,
    status: 'published',
    installHook: pkg.installHook ?? { steps: [] },
    metadata: pkg.metadata,
    createdAt: now,
    updatedAt: now,
    publisher: {
      id: publisherId,
      slug: publisher.slug,
      name: publisher.name,
      avatarUrl: 'https://github.com/github.png',
      tier: publisher.tier,
      bio: null,
      createdAt: now,
    },
  } as DbRow
}

function buildTarball(repo: FixtureRepo, sha: string, workDir: string): Uint8Array {
  // codeload puts everything under one top-level directory `<name>-<sha>`.
  const top = `${repo.repo.split('/')[1]}-${sha}`
  const stage = join(workDir, 'stage', top)
  cpSync(repo.dir, stage, { recursive: true })
  const out = join(workDir, `${top}.tar.gz`)
  // COPYFILE_DISABLE keeps macOS tar from adding AppleDouble `._*` entries.
  const res = spawnSync('tar', ['-czf', out, '-C', join(workDir, 'stage'), top], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  })
  if (res.status !== 0) throw new Error(`tar failed: ${res.stderr}`)
  rmSync(join(workDir, 'stage'), { recursive: true, force: true })
  return readFileSync(out)
}

function repoSha(repo: FixtureRepo): string {
  return createHash('sha1').update(`${repo.repo}@${repo.ref}`).digest('hex')
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export function startFixtureStore(options: FixtureStoreOptions): FixtureStore {
  const workDir = mkdtempSync(join(tmpdir(), 'as-fixture-store-'))
  const shas: Record<string, string> = {}
  const tarballs = new Map<string, Uint8Array>()
  for (const repo of options.repos ?? []) {
    const sha = repoSha(repo)
    shas[repo.repo] = sha
    tarballs.set(`${repo.repo}/${sha}`, buildTarball(repo, sha, workDir))
  }

  let items: Record<string, unknown> = {}
  const server = Bun.serve({
    port: options.port ?? 0,
    hostname: '127.0.0.1',
    async fetch(req) {
      const { pathname } = new URL(req.url)

      if (pathname.startsWith('/files/')) {
        const file = options.files?.[decodeURIComponent(pathname.slice('/files/'.length))]
        return file ? new Response(Bun.file(file)) : json({ error: 'not found' }, 404)
      }

      const commit = pathname.match(/^\/github-api\/repos\/([^/]+\/[^/]+)\/commits\/([^/]+)$/)
      if (commit) {
        const repo = (options.repos ?? []).find(r => r.repo === commit[1] && (r.ref === commit[2] || shas[r.repo] === commit[2]))
        return repo ? json({ sha: shas[repo.repo] }) : json({ message: 'No commit found' }, 422)
      }

      const codeload = pathname.match(/^\/codeload\/([^/]+\/[^/]+)\/tar\.gz\/([^/]+)$/)
      if (codeload) {
        const body = tarballs.get(`${codeload[1]}/${codeload[2]}`)
        return body
          ? new Response(body, { headers: { 'content-type': 'application/x-gzip' } })
          : new Response('404: Not Found', { status: 404 })
      }

      if (pathname === '/api/items') return json({ items: Object.values(items) })

      const install = pathname.match(/^\/api\/items\/([^/]+)\/install$/)
      if (install && req.method === 'POST') return new Response(null, { status: 204 })

      const detail = pathname.match(/^\/api\/items\/([^/]+)$/)
      if (detail) {
        const item = items[decodeURIComponent(detail[1])]
        return item ? json({ item }) : json({ error: 'not found' }, 404)
      }

      return json({ error: 'not found' }, 404)
    },
  })

  const url = `http://127.0.0.1:${server.port}`
  items = Object.fromEntries(
    options.packages(url).map(pkg => [pkg.slug, mapItem(toRow(pkg, options.publisher))])
  )

  return {
    url,
    githubApiUrl: `${url}/github-api`,
    codeloadUrl: `${url}/codeload`,
    shas,
    stop() {
      server.stop(true)
      rmSync(workDir, { recursive: true, force: true })
    },
  }
}
