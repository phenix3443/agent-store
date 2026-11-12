// Search, detail and resolving what the user typed, against GET /api/resources.
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { EngineImpl } from '../engine'
import { catalogCachePath } from '../catalog-cache'
import { AmbiguousResourceError, CatalogUnavailableError, ResourceNotFoundError } from '../catalog'
import { mcpResource, npmPackage, providerResource, serveCatalog, skillResource } from './helpers/resources'

const findSkills = skillResource('vercel-labs/skills/find-skills', { 'SKILL.md': '---\nname: find-skills\ndescription: d\n---\n' })
const otherFind = skillResource('acme/tools/huawei-find-skills', { 'SKILL.md': 'x' })
const playwrightA = { ...mcpResource('io.github.microsoft/playwright-mcp', { packages: [npmPackage('@playwright/mcp')] }), verified: false }
const playwrightB = { ...mcpResource('io.github.someone/playwright-mcp', { packages: [npmPackage('pw-mcp')] }), verified: false }
const openrouter = providerResource('openrouter')

let aasHome: string
let engine: EngineImpl
let requests: string[]
const origFetch = globalThis.fetch

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-catalog-')
  requests = []
  engine = new EngineImpl({ aasHome, claudeConfigDir: `${aasHome}/claude`, codexConfigDir: `${aasHome}/codex` }, 'http://store.test')
  globalThis.fetch = serveCatalog([findSkills, otherFind, playwrightA, playwrightB, openrouter], {}, requests)
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(aasHome, { recursive: true, force: true })
})

test('search passes query, kind, sort and paging to /api/resources and adds the local slug', async () => {
  const result = await engine.search('find', { category: 'skill', sort: 'installs', limit: 1, offset: 0 })
  expect(result.offline).toBe(false)
  expect(result.resources.map(r => [r.id, r.slug])).toEqual([['github:vercel-labs/skills/find-skills', 'skills-find-skills']])
  expect(result.nextOffset).toBe(1)
  const url = new URL(requests[0])
  expect(Object.fromEntries(url.searchParams)).toEqual({ kind: 'skill', q: 'find', sort: 'installs', limit: '1' })
})

test('the first page of a tab is cached and served, searched locally, while the API is down', async () => {
  await engine.search('', { category: 'skill' })
  const cache = JSON.parse(await readFile(catalogCachePath(aasHome), 'utf-8'))
  expect(Object.keys(cache.pages)).toEqual(['skill'])

  globalThis.fetch = (async () => { throw new Error('network down') }) as unknown as typeof fetch
  const offline = await engine.search('huawei', { category: 'skill' })
  expect(offline.offline).toBe(true)
  expect(offline.resources.map(r => r.id)).toEqual(['github:acme/tools/huawei-find-skills'])
  expect(await engine.search('', { category: 'mcp' })).toEqual({ resources: [], nextOffset: null, offline: true })
})

test('a search with a query is not cached', async () => {
  await engine.search('find')
  await expect(readFile(catalogCachePath(aasHome), 'utf-8')).rejects.toThrow()
})

test('getResource by id, by slug and by name', async () => {
  expect((await engine.getResource('github:vercel-labs/skills/find-skills')).slug).toBe('skills-find-skills')
  expect((await engine.getResource('skills-find-skills')).id).toBe('github:vercel-labs/skills/find-skills')
  expect((await engine.getResource('find-skills')).id).toBe('github:vercel-labs/skills/find-skills')
  expect((await engine.getResource('openrouter')).id).toBe('builtin:openrouter')
})

test('a slug two resources share is ambiguous and names both ids; the id installs either', async () => {
  const err = await engine.getResource('playwright-mcp').catch(e => e)
  expect(err).toBeInstanceOf(AmbiguousResourceError)
  expect(err.candidates).toEqual(['mcp-registry:io.github.microsoft/playwright-mcp', 'mcp-registry:io.github.someone/playwright-mcp'])
  expect((await engine.getResource('mcp-registry:io.github.someone/playwright-mcp')).slug).toBe('playwright-mcp')
})

test('one verified candidate wins a shared slug', async () => {
  globalThis.fetch = serveCatalog([{ ...playwrightA, verified: true }, playwrightB])
  expect((await engine.getResource('playwright-mcp')).id).toBe('mcp-registry:io.github.microsoft/playwright-mcp')
})

test('unknown refs and a kind mismatch are not found; an API failure is reported as such', async () => {
  await expect(engine.getResource('nope-nothing')).rejects.toBeInstanceOf(ResourceNotFoundError)
  await expect(engine.getResource('github:x/y/z')).rejects.toBeInstanceOf(ResourceNotFoundError)
  await expect(engine.getResource('openrouter', { kind: 'skill' })).rejects.toBeInstanceOf(ResourceNotFoundError)
  globalThis.fetch = (async () => new Response('{"error":"boom"}', { status: 500 })) as unknown as typeof fetch
  await expect(engine.getResource('github:vercel-labs/skills/find-skills')).rejects.toBeInstanceOf(CatalogUnavailableError)
})
