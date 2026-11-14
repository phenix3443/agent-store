import { expect, test } from 'bun:test'
import { PassThrough } from 'node:stream'
import { STORE_ORIGINS } from '@as/client-core'
import { localApiOrigins, runLocalApi } from '../local-api'

test('the store origins are always allowed; a build adds its own store origin', () => {
  expect(localApiOrigins([])).toEqual([...STORE_ORIGINS])
  expect(localApiOrigins(['http://localhost:3000'])).toEqual([...STORE_ORIGINS, 'http://localhost:3000'])
  expect(localApiOrigins(['https://agent-store-test.panghuli.tech'])).toEqual([...STORE_ORIGINS])
})

test('anything but a bare http(s) origin is ignored', () => {
  for (const arg of ['*', 'null', 'file:///etc', 'javascript:alert(1)', 'https://evil.example/path', 'not a url']) {
    expect(localApiOrigins([arg])).toEqual([...STORE_ORIGINS])
  }
})

test('serves until stdin closes, then stops', async () => {
  const stdin = new PassThrough()
  let stopped = false
  const done = runLocalApi([], () => ({ stop: () => { stopped = true } }), stdin)
  await Bun.sleep(10)
  expect(stopped).toBe(false)
  stdin.end()
  await done
  expect(stopped).toBe(true)
})

test('a port already taken is logged, not thrown', async () => {
  await runLocalApi([], () => {
    throw new Error('EADDRINUSE')
  }, new PassThrough())
})
