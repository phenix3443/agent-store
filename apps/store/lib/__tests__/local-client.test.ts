import { afterEach, beforeEach, expect, test } from 'bun:test'
import { LOCAL_API, askInstalled, markDesktopSeen, shouldAskClient } from '../local-client'

const realFetch = globalThis.fetch
let permission: PermissionState | null

beforeEach(() => {
  localStorage.clear()
  permission = null
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: {
      query: async ({ name }: { name: string }) => {
        if (!permission || name !== 'loopback-network') throw new TypeError(`unknown permission ${name}`)
        return { state: permission }
      },
    },
  })
})
afterEach(() => {
  globalThis.fetch = realFetch
})

test('a browser that never used the desktop client is not asked', async () => {
  expect(await shouldAskClient()).toBe(false)
  permission = 'prompt'
  expect(await shouldAskClient()).toBe(false)
})

test('asked once this browser has handed something to the client', async () => {
  markDesktopSeen()
  expect(await shouldAskClient()).toBe(true)
})

test('a granted loopback permission is enough; a denied one always wins', async () => {
  permission = 'granted'
  expect(await shouldAskClient()).toBe(true)
  permission = 'denied'
  markDesktopSeen()
  expect(await shouldAskClient()).toBe(false)
})

test('asks the loopback endpoint without cookies or referrer, and keeps only the asked ids', async () => {
  let seen: { url: string; init?: RequestInit } | undefined
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen = { url, init }
    return new Response(JSON.stringify({ installed: ['github:a/b/c', 'github:not/asked/x', 42] }))
  }) as unknown as typeof fetch
  const found = await askInstalled(['github:a/b/c', 'mcp-registry:io.x/y'])
  expect(seen?.url).toBe(`${LOCAL_API}/v1/installed?ids=${encodeURIComponent('github:a/b/c,mcp-registry:io.x/y')}`)
  expect(seen?.init).toMatchObject({ mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
  expect([...found!]).toEqual(['github:a/b/c'])
})

test('no client, a refusal or a malformed answer is null, never an empty set', async () => {
  globalThis.fetch = (async () => {
    throw new TypeError('Failed to fetch')
  }) as unknown as typeof fetch
  expect(await askInstalled(['github:a/b/c'])).toBeNull()
  globalThis.fetch = (async () => new Response(null, { status: 403 })) as unknown as typeof fetch
  expect(await askInstalled(['github:a/b/c'])).toBeNull()
  globalThis.fetch = (async () => new Response(JSON.stringify({ nope: true }))) as unknown as typeof fetch
  expect(await askInstalled(['github:a/b/c'])).toBeNull()
})

test('a client that does not answer in time is given up on', async () => {
  globalThis.fetch = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch
  expect(await askInstalled(['github:a/b/c'], 20)).toBeNull()
})
