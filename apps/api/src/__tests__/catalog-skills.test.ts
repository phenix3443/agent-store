import { describe, expect, test } from 'bun:test'
import type { ResourceSummary, SkillResourceDetail } from '@as/types'
import { findSkillDirs, githubSkillsSource, type TreeEntry } from '../catalog/sources/github-skills'
import type { SourceContext } from '../catalog/types'
import { ANTHROPIC_SKILLS_SHA, fakeFetch, fixtureJson, githubRoutes, octokitWith, type Route } from './helpers/upstream-fixtures'

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

describe('githubSkillsSource', () => {
  const ctx = (f: typeof fetch, knownScopes: string[] = [], skills?: SourceContext['skills']): SourceContext => ({
    fetch: f, github: octokitWith(f), now: new Date(), full: false, state: { watermark: null, knownScopes }, log: () => {},
    ...(skills ? { skills } : {}),
  })
  const installs = new Map([['anthropics/skills/frontend-design', 1106066]])

  test('scans the queued repos into records pinned to their commit, with skills.sh installs', async () => {
    const f = fakeFetch(githubRoutes)
    const run = await githubSkillsSource().run(ctx(f, ['other/repo'], { repos: ['anthropics/skills'], installs }))
    expect(run.errors).toEqual([])
    expect(run.coverage).toEqual({ mode: 'scoped', scopes: ['anthropics/skills'] })
    expect(run.attempted).toEqual([{ repo: 'anthropics/skills', status: 'scanned' }])
    expect(run.skipped).toEqual({})
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

  test('without a queue it rescans the repos it holds, up to the cap', async () => {
    const f = fakeFetch(githubRoutes)
    const run = await githubSkillsSource({ maxRepos: 1 }).run(ctx(f, ['anthropics/skills', 'other/repo']))
    expect(run.records).toHaveLength(19)
    expect(run.records.every((r) => r.installs === null)).toBe(true)
    expect(run.skipped).toEqual({ 'repo over the per-run repo cap': 1 })
  })

  test('a SKILL.md that fails to download leaves the repo unreconciled, so none of its skills is marked gone', async () => {
    const flaky: Route = (url) => (url.hostname === 'raw.githubusercontent.com' && url.pathname.endsWith('/skills/pdf/SKILL.md') ? new Response('', { status: 500 }) : undefined)
    const f = fakeFetch(flaky, githubRoutes)
    const run = await githubSkillsSource({ repos: ['anthropics/skills'] }).run(ctx(f))
    expect(run.records).toHaveLength(18)
    expect(run.coverage).toEqual({ mode: 'scoped', scopes: [] })
    expect(run.attempted).toEqual([{ repo: 'anthropics/skills', status: 'partial' }])
    expect(run.errors).toEqual(['anthropics/skills: 1 SKILL.md downloads failed; its skills keep their previous state'])
  })

  test('a repo that is gone is covered with nothing; known repos are revisited', async () => {
    const f = fakeFetch(githubRoutes)
    const run = await githubSkillsSource().run(ctx(f, ['gone/repo']))
    expect(run.coverage).toEqual({ mode: 'scoped', scopes: ['gone/repo'] })
    expect(run.errors).toEqual(['gone/repo: repository not found'])
    expect(run.attempted).toEqual([{ repo: 'gone/repo', status: 'not found' }])
  })

  test('a rate limit stops scanning and leaves those repos uncovered', async () => {
    const limited: Route = (url) =>
      url.hostname === 'api.github.com'
        ? new Response(JSON.stringify({ message: 'API rate limit exceeded' }), { status: 403, headers: { 'x-ratelimit-remaining': '0' } })
        : undefined
    const f = fakeFetch(limited)
    const run = await githubSkillsSource({ repos: ['anthropics/skills'] }).run(ctx(f))
    expect(run.coverage).toEqual({ mode: 'scoped', scopes: [] })
    expect(run.skipped['repo not scanned: GitHub rate limit']).toBe(1)
    // Not attempted, so the repo stays due in the queue.
    expect(run.attempted).toEqual([])
  })
})
