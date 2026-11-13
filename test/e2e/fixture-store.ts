// A stand-in for the Agent Store catalog API and the GitHub endpoints a skill install
// reads, for offline tests. Resources are served in the /api/resources shape
// (packages/types/src/resources.ts), so the client installs them the way it installs
// real catalog entries.
//
// Routes:
//   GET  /api/resources?kind=&q=                      → { resources, nextOffset }
//   GET  /api/resources/<id>                          → { resource }
//   GET  /github-api/repos/:owner/:repo/commits/:ref  → { sha }      (AS_GITHUB_API_URL)
//   GET  /codeload/:owner/:repo/tar.gz/:sha           → repo tarball (AS_CODELOAD_URL)
import { spawnSync } from 'child_process'
import { createHash } from 'crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { resourceSlug } from '../../packages/types/src/catalog'
import type {
  McpArgument,
  McpKeyValueInput,
  McpResourceDetail,
  ResourceDetail,
  ResourceSummary,
  SkillResourceDetail,
} from '../../packages/types/src/resources'

/** A skill: a directory holding SKILL.md in one of the fixture repos. */
export interface FixtureSkill {
  kind: 'skill'
  /** The slug `aas install` takes; must equal `<repo name>-<skillId>`, as the client derives it. */
  slug: string
  name: string
  description: string
  /** `owner/name` of one of `repos`. */
  repo: string
  skillId: string
  /** Repo-relative directory holding SKILL.md. */
  dir: string
}

/** A stdio MCP server started as `node <script> <args…>`. */
export interface FixtureMcp {
  kind: 'mcp'
  slug: string
  name: string
  description: string
  script: string
  args?: string[]
  /** Required environment variables, filled in with `aas config`. */
  env?: Array<{ name: string; description: string }>
}

export type FixtureResource = FixtureSkill | FixtureMcp

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
  /** Author of every resource; MCP server ids are `io.github.<author>/<slug>`. */
  author: string
  resources: FixtureResource[]
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

const SYNCED_AT = '2026-10-22T00:00:00Z'

const input = {
  description: null, isRequired: false, isSecret: false, default: null, value: null,
  placeholder: null, choices: [], format: null,
}

function summary(id: string, site: 'github' | 'mcp-registry', upstreamId: string, r: FixtureResource, author: string): ResourceSummary {
  return {
    id,
    kind: r.kind,
    name: r.name,
    description: r.description,
    author: { name: author, url: null },
    version: '1.0.0',
    homepageUrl: null,
    installs: null,
    stars: null,
    verified: false,
    tags: [r.kind, 'fixture'],
    transports: r.kind === 'mcp' ? ['npm'] : [],
    origin: {
      site, upstreamId, url: null, upstreamVersion: '1.0.0', upstreamUpdatedAt: SYNCED_AT,
      syncedAt: SYNCED_AT, unavailableAt: null, unavailableReason: null,
    },
  }
}

function skillDetail(r: FixtureSkill, author: string, shas: Record<string, string>, codeloadUrl: string): SkillResourceDetail {
  const sha = shas[r.repo]
  if (!sha) throw new Error(`${r.slug}: ${r.repo} is not one of the fixture repos`)
  const upstreamId = `${r.repo}/${r.skillId}`
  return {
    ...summary(`github:${upstreamId}`, 'github', upstreamId, r, author),
    kind: 'skill',
    repo: { fullName: r.repo, ref: 'main', commit: sha, dir: r.dir, treeSha: sha, url: `https://github.com/${r.repo}/tree/${sha}/${r.dir}` },
    frontmatter: {},
    // Left empty so the client downloads the codeload tarball: it fetches the
    // per-file list only over https, and this server is plain http.
    files: [],
    archiveUrl: `${codeloadUrl}/${r.repo}/tar.gz/${sha}`,
  }
}

function mcpDetail(r: FixtureMcp, author: string): McpResourceDetail {
  const upstreamId = `io.github.${author}/${r.slug}`
  const args = (r.args ?? []).map((value): McpArgument => ({
    ...input, type: 'positional', name: null, value, valueHint: null, isRepeated: false, variables: {},
  }))
  const env = (r.env ?? []).map((v): McpKeyValueInput => ({
    ...input, name: v.name, description: v.description, isRequired: true, variables: {},
  }))
  return {
    ...summary(`mcp-registry:${upstreamId}`, 'mcp-registry', upstreamId, r, author),
    kind: 'mcp',
    title: null,
    status: 'active',
    statusMessage: null,
    publishedAt: SYNCED_AT,
    repository: null,
    icons: [],
    packages: [{
      registryType: 'npm',
      identifier: r.script,
      version: null,
      registryBaseUrl: null,
      runtimeHint: 'node',
      fileSha256: null,
      transport: { type: 'stdio', url: null, headers: [], variables: {} },
      runtimeArguments: [],
      packageArguments: args,
      environmentVariables: env,
    }],
    remotes: [],
  }
}

function toSummary(r: ResourceDetail): ResourceSummary {
  const { id, kind, name, description, author, version, homepageUrl, installs, stars, verified, tags, transports, origin } = r
  return { id, kind, name, description, author, version, homepageUrl, installs, stars, verified, tags, transports, origin }
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

  let resources: ResourceDetail[] = []
  const server = Bun.serve({
    port: options.port ?? 0,
    hostname: '127.0.0.1',
    async fetch(req) {
      const url = new URL(req.url)
      const { pathname } = url

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

      if (pathname === '/api/resources') {
        const kind = url.searchParams.get('kind')
        const q = url.searchParams.get('q')?.toLowerCase()
        const rows = resources.filter(r =>
          (!kind || r.kind === kind) &&
          (!q || [r.name, r.description ?? '', r.id, resourceSlug(r) ?? ''].some(s => s.toLowerCase().includes(q)))
        )
        return json({ resources: rows.map(toSummary), nextOffset: null })
      }

      if (pathname.startsWith('/api/resources/')) {
        const id = pathname.slice('/api/resources/'.length).split('/').map(decodeURIComponent).join('/')
        const resource = resources.find(r => r.id === id)
        return resource ? json({ resource }) : json({ error: 'Not found' }, 404)
      }

      return json({ error: 'Not found' }, 404)
    },
  })

  const url = `http://127.0.0.1:${server.port}`
  const codeloadUrl = `${url}/codeload`
  resources = options.resources.map(r => {
    const detail = r.kind === 'skill' ? skillDetail(r, options.author, shas, codeloadUrl) : mcpDetail(r, options.author)
    const slug = resourceSlug(detail)
    if (slug !== r.slug) throw new Error(`fixture ${r.slug}: the client would call it ${slug}`)
    return detail
  })

  return {
    url,
    githubApiUrl: `${url}/github-api`,
    codeloadUrl,
    shas,
    stop() {
      server.stop(true)
      rmSync(workDir, { recursive: true, force: true })
    },
  }
}
