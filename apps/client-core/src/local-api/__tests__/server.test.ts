import { afterEach, expect, test } from 'bun:test'
import type { InstalledItem } from '@as/types'
import { LOCAL_API_PORT, MAX_IDS, STORE_ORIGINS, localApiHandler, startLocalApi } from '../server'

const SKILL = 'github:anthropics/skills/frontend-design'
const MCP = 'mcp-registry:io.github.github/github-mcp-server'
const PROVIDER = 'builtin:openrouter'
const STORE = 'https://agent-store.panghuli.tech'
const HOST = `127.0.0.1:${LOCAL_API_PORT}`

function entry(resourceId: string | undefined, category: InstalledItem['category'], slug = 'x'): InstalledItem {
  return { slug, category, version: '1', installedAt: '', updatedAt: '', compatibleWith: ['claude'], enabledFor: {}, resourceId }
}

let reads = 0
const installed = async () => {
  reads++
  return [entry(SKILL, 'skill'), entry(MCP, 'mcp'), entry(PROVIDER, 'provider'), entry(undefined, 'skill', 'legacy')]
}
const handler = localApiHandler({ origins: STORE_ORIGINS, installed })

function ask(ids: string, headers: Record<string, string> = { origin: STORE }, init: RequestInit = {}, host = HOST) {
  const url = `http://${host}/v1/installed?ids=${encodeURIComponent(ids)}`
  return handler(new Request(url, { ...init, headers }))
}

let stop: (() => void) | undefined
afterEach(() => {
  reads = 0
  stop?.()
  stop = undefined
})

test('the store gets the asked ids that are installed, and nothing else', async () => {
  const res = await ask([SKILL, MCP, 'github:someone/else/skill'].join(','))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ installed: [SKILL, MCP] })
  expect(res.headers.get('access-control-allow-origin')).toBe(STORE)
  expect(res.headers.get('vary')).toBe('Origin')
  expect(res.headers.get('cache-control')).toBe('no-store')
  expect(res.headers.get('access-control-allow-credentials')).toBeNull()
})

test('the test store is allowed too', async () => {
  const res = await ask(SKILL, { origin: 'https://agent-store-test.panghuli.tech' })
  expect(res.headers.get('access-control-allow-origin')).toBe('https://agent-store-test.panghuli.tech')
})

test('providers are never reported installed', async () => {
  expect(await (await ask(PROVIDER)).json()).toEqual({ installed: [] })
})

test('other origins get an empty 403 without CORS headers, and the registry is not read', async () => {
  for (const origin of [
    'https://evil.example',
    'http://agent-store.panghuli.tech',
    'https://agent-store.panghuli.tech.evil.example',
    'https://sub.agent-store.panghuli.tech',
    'null',
    '*',
  ]) {
    const res = await ask(SKILL, { origin })
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  }
  expect(reads).toBe(0)
})

test('a request without an Origin (not from a web page) is refused the same way', async () => {
  const res = await ask(SKILL, {})
  expect(res.status).toBe(403)
  expect(res.headers.get('access-control-allow-origin')).toBeNull()
  expect(reads).toBe(0)
})

test('a request reaching us under another host name (DNS rebinding) is refused', async () => {
  for (const host of [`evil.example:${LOCAL_API_PORT}`, `localhost:${LOCAL_API_PORT}`, `127.0.0.1:${LOCAL_API_PORT + 1}`]) {
    expect((await ask(SKILL, { origin: STORE }, {}, host)).status).toBe(403)
  }
  expect(reads).toBe(0)
})

test("preflights from other origins are refused; the store's is answered, PNA included", async () => {
  const preflight = (origin: string) =>
    ask(SKILL, { origin, 'access-control-request-method': 'GET', 'access-control-request-private-network': 'true' }, { method: 'OPTIONS' })
  const bad = await preflight('https://evil.example')
  expect(bad.status).toBe(403)
  expect(bad.headers.get('access-control-allow-private-network')).toBeNull()
  const ok = await preflight(STORE)
  expect(ok.status).toBe(204)
  expect(ok.headers.get('access-control-allow-origin')).toBe(STORE)
  expect(ok.headers.get('access-control-allow-private-network')).toBe('true')
  expect(ok.headers.get('access-control-allow-methods')).toBe('GET')
})

test('only GET /v1/installed exists', async () => {
  const other = await handler(new Request(`http://${HOST}/v1/registry`, { headers: { origin: STORE } }))
  expect(other.status).toBe(404)
  expect((await ask(SKILL, { origin: STORE }, { method: 'POST' })).status).toBe(405)
  expect(reads).toBe(0)
})

test('malformed or too many ids are a 400', async () => {
  const tooMany = Array.from({ length: MAX_IDS + 1 }, (_, i) => `github:o/r/s${i}`).join(',')
  for (const ids of ['', 'nope', 'github:a b', `${SKILL},,${MCP}`, tooMany]) {
    expect((await ask(ids)).status).toBe(400)
  }
  expect(reads).toBe(0)
})

test('an unreadable registry is a 503, not an empty answer', async () => {
  const broken = localApiHandler({ origins: STORE_ORIGINS, installed: () => Promise.reject(new Error('bad json')) })
  const res = await broken(new Request(`http://${HOST}/v1/installed?ids=${SKILL}`, { headers: { origin: STORE } }))
  expect(res.status).toBe(503)
})

test('the server listens on the loopback address and answers only the store', async () => {
  const port = 20000 + Math.floor(Math.random() * 20000)
  stop = startLocalApi({ origins: STORE_ORIGINS, installed, port }).stop
  const url = `http://127.0.0.1:${port}/v1/installed?ids=${encodeURIComponent(SKILL)}`
  expect(await (await fetch(url, { headers: { origin: STORE } })).json()).toEqual({ installed: [SKILL] })
  expect((await fetch(url, { headers: { origin: 'https://evil.example' } })).status).toBe(403)
})
