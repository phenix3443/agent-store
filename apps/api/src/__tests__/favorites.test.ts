import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FavoritesResponse, ResourceSummary } from '@as/types'
import { getDb, openAppDb } from '../db/client'
import { migrateAppDb } from '../migrate'
import { favoriteRoutes, MAX_FAVORITES } from '../favorites'
import type { CatalogReader } from '../catalog/reader'

const { app: fullApp } = await import('../app')

const SKILL = 'github:anthropics/skills/frontend-design'
const MCP = 'mcp-registry:io.github.github/github-mcp-server'

function summary(id: string): ResourceSummary {
  return {
    id,
    kind: id.startsWith('github:') ? 'skill' : 'mcp',
    name: id.split('/').pop()!,
    description: null,
    author: null,
    version: null,
    homepageUrl: null,
    installs: null,
    stars: null,
    verified: false,
    tags: [],
    transports: [],
    origin: { site: 'github', upstreamId: id, sourceUrl: '', upstreamUpdatedAt: null, unavailableAt: null },
  } as unknown as ResourceSummary
}

let catalog = new Set([SKILL, MCP])
let catalogReady = true
const reader = {
  get ready() {
    return catalogReady
  },
  summaries: (ids: string[]) => new Map(ids.filter((id) => catalog.has(id)).map((id) => [id, summary(id)])),
} as unknown as CatalogReader

let dir: string
let env: { APP_DB_PATH: string }

function addUser(id: string) {
  const sqlite = openAppDb(env.APP_DB_PATH)
  sqlite
    .query('INSERT INTO user (id, name, email, emailVerified) VALUES (?, ?, ?, 1)')
    .run(id, id, `${id}@example.com`)
  sqlite.close()
}

const routes = () =>
  favoriteRoutes({
    db: () => getDb(env),
    // The tests stand in for token verification: the bearer value is the user id.
    user: async (c) => {
      const id = c.req.header('Authorization')?.replace(/^Bearer /, '')
      return id ? { id } : null
    },
    reader,
  })

function call(method: string, path: string, user?: string) {
  const headers: Record<string, string> = user ? { Authorization: `Bearer ${user}` } : {}
  return routes().fetch(new Request(`http://localhost${path}`, { method, headers }))
}

async function list(user: string): Promise<FavoritesResponse> {
  const res = await call('GET', '/api/me/favorites', user)
  expect(res.status).toBe(200)
  return (await res.json()) as FavoritesResponse
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'favorites-'))
  env = { APP_DB_PATH: join(dir, 'app.db') }
  migrateAppDb(env.APP_DB_PATH)
  addUser('alice')
  addUser('bob')
  catalog = new Set([SKILL, MCP])
  catalogReady = true
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

test('every endpoint needs a signed-in user', async () => {
  for (const [method, path] of [
    ['GET', '/api/me/favorites'],
    ['PUT', `/api/me/favorites/${SKILL}`],
    ['DELETE', `/api/me/favorites/${SKILL}`],
  ] as const) {
    expect((await call(method, path)).status).toBe(401)
  }
})

test('the real app answers 401 without a bearer token', async () => {
  const res = await fullApp.fetch(new Request('http://localhost/api/me/favorites'))
  expect(res.status).toBe(401)
})

test('add, list newest first with the catalog summary, remove', async () => {
  expect((await call('PUT', `/api/me/favorites/${SKILL}`, 'alice')).status).toBe(200)
  await Bun.sleep(5)
  // Encoded per segment, as the SDK sends it.
  const encoded = MCP.split('/').map(encodeURIComponent).join('/')
  const put = await call('PUT', `/api/me/favorites/${encoded}`, 'alice')
  expect(await put.json()).toEqual({ id: MCP, favorited: true })

  const { favorites } = await list('alice')
  expect(favorites.map((f) => f.id)).toEqual([MCP, SKILL])
  expect(favorites[0]!.resource?.name).toBe('github-mcp-server')
  expect(Number.isNaN(Date.parse(favorites[0]!.createdAt))).toBe(false)

  const del = await call('DELETE', `/api/me/favorites/${SKILL}`, 'alice')
  expect(await del.json()).toEqual({ id: SKILL, favorited: false })
  expect((await list('alice')).favorites.map((f) => f.id)).toEqual([MCP])
})

test('adding twice and removing what is not saved are no-ops', async () => {
  await call('PUT', `/api/me/favorites/${SKILL}`, 'alice')
  expect((await call('PUT', `/api/me/favorites/${SKILL}`, 'alice')).status).toBe(200)
  expect((await list('alice')).favorites).toHaveLength(1)
  expect((await call('DELETE', `/api/me/favorites/${MCP}`, 'alice')).status).toBe(200)
})

test('one user never sees or removes another user\'s favorites', async () => {
  await call('PUT', `/api/me/favorites/${SKILL}`, 'alice')
  expect((await list('bob')).favorites).toEqual([])
  await call('DELETE', `/api/me/favorites/${SKILL}`, 'bob')
  expect((await list('alice')).favorites).toHaveLength(1)
})

test('malformed ids are refused', async () => {
  for (const id of ['nope', 'ftp:x', 'github:', 'github:a b', encodeURIComponent('github:%E0%A4%A')]) {
    expect((await call('PUT', `/api/me/favorites/${id}`, 'alice')).status).toBe(400)
  }
  expect((await call('PUT', '/api/me/favorites/%E0%A4%A', 'alice')).status).toBe(400)
})

test('an id the loaded catalog lacks is 404; before the catalog loads it is accepted', async () => {
  const gone = 'github:someone/repo/missing'
  expect((await call('PUT', `/api/me/favorites/${gone}`, 'alice')).status).toBe(404)
  catalogReady = false
  expect((await call('PUT', `/api/me/favorites/${gone}`, 'alice')).status).toBe(200)
})

test('a favorite whose resource left the catalog is listed with a null resource', async () => {
  await call('PUT', `/api/me/favorites/${SKILL}`, 'alice')
  catalog = new Set([MCP])
  expect((await list('alice')).favorites).toEqual([expect.objectContaining({ id: SKILL, resource: null })])
})

test(`at most ${MAX_FAVORITES} per user`, async () => {
  const sqlite = openAppDb(env.APP_DB_PATH)
  const insert = sqlite.query('INSERT INTO favorites (user_id, resource_id) VALUES (?, ?)')
  for (let i = 0; i < MAX_FAVORITES; i++) insert.run('alice', `github:o/r/s${i}`)
  sqlite.close()
  expect((await call('PUT', `/api/me/favorites/${SKILL}`, 'alice')).status).toBe(409)
  // Re-saving one already there still answers 200.
  catalogReady = false
  expect((await call('PUT', '/api/me/favorites/github:o/r/s0', 'alice')).status).toBe(200)
})

test('a token for a deleted account is 401, and deleting the account removes its favorites', async () => {
  await call('PUT', `/api/me/favorites/${SKILL}`, 'alice')
  expect((await call('PUT', `/api/me/favorites/${SKILL}`, 'carol')).status).toBe(401)
  const sqlite = openAppDb(env.APP_DB_PATH)
  sqlite.query("DELETE FROM user WHERE id = 'alice'").run()
  const { n } = sqlite.query('SELECT count(*) AS n FROM favorites').get() as { n: number }
  sqlite.close()
  expect(n).toBe(0)
})

test('responses are not cached', async () => {
  const res = await call('GET', '/api/me/favorites', 'alice')
  expect(res.headers.get('cache-control')).toBe('no-store')
})
