import { describe, expect, test } from 'bun:test'
import type { ResourceSummary, SkillResourceDetail } from '@as/types'
import { findSkillDirs, githubSkillsSource, type TreeEntry } from '../catalog/sources/github-skills'
import { discoverFromSkillsSh } from '../catalog/sources/skills-sh'
import type { SourceContext } from '../catalog/types'
import {
  ANTHROPIC_SKILLS_SHA,
  fakeFetch,
  fixtureJson,
  githubRoutes,
  hangingFetch,
  json,
  octokitWith,
  type Route,
} from './helpers/upstream-fixtures'

type Skill = Omit<SkillResourceDetail, keyof ResourceSummary>

const blob = (path: string): TreeEntry => ({ path, mode: '100644', type: 'blob', sha: 'x' })

describe('findSkillDirs', () => {
  test('recorded anthropics/skills tree: every skills/<name> directory, not template/', () => {
    const dirs = findSkillDirs(fixtureJson<{ tree: TreeEntry[] }>('github-anthropics-skills-tree.json').tree)
    expect(dirs).toHaveLength(19)
    expect(dirs).toContain('skills/frontend-design')
    expect(dirs.every((d) => /^skills\/[^/]+$/.test(d))).toBe(true)
  })

  test('root first, containers in order, up to three levels, shallower shadows deeper', () => {
    const dirs = findSkillDirs([
      blob('SKILL.md'),
      blob('.claude/skills/b/SKILL.md'),
      blob('skills/a/SKILL.md'),
      blob('skills/a/nested/SKILL.md'),
      blob('skills/cat/sub/c/SKILL.md'),
      blob('skills/w/x/y/z/SKILL.md'),
      blob('docs/ja/skills/a/SKILL.md'),
    ])
    expect(dirs).toEqual(['', 'skills/a', 'skills/cat/sub/c', '.claude/skills/b'])
  })

  test('falls back to every SKILL.md when no container has one', () => {
    expect(findSkillDirs([blob('tools/x/SKILL.md'), blob('node_modules/y/SKILL.md'), blob('tools/x/inner/SKILL.md')])).toEqual(['tools/x'])
  })
})

const skillsShRoute = (body: unknown): Route => (url) => (url.hostname === 'skills.sh' ? json(body) : undefined)

describe('discoverFromSkillsSh', () => {
  test('collects source repos and install counts', async () => {
    const f = fakeFetch(skillsShRoute(fixtureJson('skills-sh-search-frontend.json')))
    const d = await discoverFromSkillsSh(f, { queries: ['frontend'] })
    expect(f.calls[0]).toBe('https://skills.sh/api/search?q=frontend&limit=200')
    expect(d.errors).toEqual([])
    expect(d.installs.get('anthropics/skills/frontend-design')).toBe(1106066)
    expect(d.repos.get('anthropics/skills')).toMatchObject({ fullName: 'anthropics/skills' })
  })

  test('a timeout leaves discovery empty with an error, and stops after three straight failures', async () => {
    const d = await discoverFromSkillsSh(hangingFetch(), { queries: ['a1', 'b2', 'c3', 'd4'], timeoutMs: 20 })
    expect(d.repos.size).toBe(0)
    expect(d.errors).toHaveLength(3)
    expect(d.errors[0]).toContain('did not answer')
  })
})

describe('githubSkillsSource', () => {
  const ctx = (f: typeof fetch, knownScopes: string[] = []): SourceContext => ({
    fetch: f, github: octokitWith(f), now: new Date(), full: false, state: { watermark: null, knownScopes }, log: () => {},
  })

  test('scans a repo into records pinned to its commit, with skills.sh installs', async () => {
    const f = fakeFetch(skillsShRoute(fixtureJson('skills-sh-search-frontend.json')), githubRoutes)
    const run = await githubSkillsSource({ repos: ['anthropics/skills'], maxRepos: 1, skillsSh: { queries: ['frontend'] } }).run(ctx(f))
    expect(run.errors).toEqual([])
    expect(run.coverage).toEqual({ mode: 'scoped', scopes: ['anthropics/skills'] })
    expect(run.skipped).toEqual({ 'repo over the per-run repo cap': 1 })
    expect(run.records).toHaveLength(19)
    const fd = run.records.find((r) => r.upstreamId === 'anthropics/skills/frontend-design')!
    const detail = fd.detail as Skill
    expect(fd.installs).toBe(1106066)
    expect(fd.description).toStartWith('Guidance for distinctive')
    expect(fd.version).toBe('d79e2a5bb4df')
    expect(detail.repo).toEqual({
      fullName: 'anthropics/skills',
      ref: 'HEAD',
      commit: ANTHROPIC_SKILLS_SHA,
      dir: 'skills/frontend-design',
      treeSha: 'd79e2a5bb4df4a386c2adcdd9ab8709bba28c3f6',
      url: `https://github.com/anthropics/skills/tree/${ANTHROPIC_SKILLS_SHA}/skills/frontend-design`,
    })
    expect(detail.frontmatter).toMatchObject({ name: 'frontend-design', license: 'Complete terms in LICENSE.txt' })
    expect(detail.files.map((x) => x.path).sort()).toEqual(['LICENSE.txt', 'SKILL.md'])
    expect(detail.files[0]!.downloadUrl).toStartWith(`https://raw.githubusercontent.com/anthropics/skills/${ANTHROPIC_SKILLS_SHA}/skills/frontend-design/`)
    expect(detail.archiveUrl).toBe(`https://codeload.github.com/anthropics/skills/tar.gz/${ANTHROPIC_SKILLS_SHA}`)
  })

  test('skills.sh failing still scans the listed repos', async () => {
    const down: Route = (url) => (url.hostname === 'skills.sh' ? new Response('', { status: 503 }) : undefined)
    const f = fakeFetch(down, githubRoutes)
    const run = await githubSkillsSource({ repos: ['anthropics/skills'], skillsSh: { queries: ['frontend'] } }).run(ctx(f))
    expect(run.records).toHaveLength(19)
    expect(run.records.every((r) => r.installs === null)).toBe(true)
    expect(run.errors).toEqual(['skills.sh: skills.sh search "frontend": HTTP 503'])
  })

  test('a repo that is gone is covered with nothing; known repos are revisited', async () => {
    const f = fakeFetch(skillsShRoute({ skills: [] }), githubRoutes)
    const run = await githubSkillsSource({ repos: [], skillsSh: { queries: ['x1'] } }).run(ctx(f, ['gone/repo']))
    expect(run.coverage).toEqual({ mode: 'scoped', scopes: ['gone/repo'] })
    expect(run.errors).toEqual(['gone/repo: repository not found'])
  })

  test('a rate limit stops scanning and leaves those repos uncovered', async () => {
    const limited: Route = (url) =>
      url.hostname === 'api.github.com'
        ? new Response(JSON.stringify({ message: 'API rate limit exceeded' }), { status: 403, headers: { 'x-ratelimit-remaining': '0' } })
        : undefined
    const f = fakeFetch(skillsShRoute({ skills: [] }), limited)
    const run = await githubSkillsSource({ repos: ['anthropics/skills'], skillsSh: { queries: ['x1'] } }).run(ctx(f))
    expect(run.coverage).toEqual({ mode: 'scoped', scopes: [] })
    expect(run.skipped['repo not scanned: GitHub rate limit']).toBe(1)
  })
})
