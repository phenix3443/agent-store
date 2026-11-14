import { expect, test } from 'bun:test'
import type { StoreClient } from '@as/sdk'
import { AccountService, FavoriteRejectedError, SessionExpiredError, StoreUnavailableError } from '../account'

type Answer = { data: unknown; error: string | null; status?: number }

function service(answer: Answer, calls: unknown[][] = []): AccountService {
  const handler = {
    get: (_: object, method: string) => async (...args: unknown[]) => {
      calls.push([method, ...args])
      return answer
    },
  }
  return new AccountService(new Proxy({}, handler) as unknown as StoreClient)
}

test('sign-in calls go out with the desktop client id', async () => {
  const calls: unknown[][] = []
  await service({ data: { status: 'pending' }, error: null }, calls).pollSignIn('dev-1')
  expect(calls).toEqual([['pollDeviceAuth', 'agent-store-desktop', 'dev-1']])
})

test('a 401 on the token exchange means the session is gone', async () => {
  await expect(service({ data: null, error: 'Unauthorized', status: 401 }).getAccessToken('s')).rejects.toBeInstanceOf(SessionExpiredError)
})

test('a network error on the token exchange is temporary, not a sign-out', async () => {
  const err = await service({ data: null, error: 'fetch failed' }).getAccessToken('s').catch((e) => e)
  expect(err).toBeInstanceOf(StoreUnavailableError)
  expect(err.name).toBe('StoreUnavailableError')
})

test('signing out a session the server already forgot succeeds', async () => {
  await service({ data: null, error: 'Unauthorized', status: 401 }).signOut('s')
  await expect(service({ data: null, error: 'Bad Gateway', status: 502 }).signOut('s')).rejects.toBeInstanceOf(StoreUnavailableError)
})

test('favorite changes the API refuses for good carry a reason', async () => {
  for (const [status, reason] of [[400, 'invalid'], [404, 'notFound'], [409, 'full']] as const) {
    const err = await service({ data: null, error: 'no', status }).setFavorite('t', 'github:a/b/c', true).catch((e) => e)
    expect(err).toBeInstanceOf(FavoriteRejectedError)
    expect(err.reason).toBe(reason)
  }
  await expect(service({ data: null, error: 'x', status: 401 }).setFavorite('t', 'github:a/b/c', true)).rejects.toBeInstanceOf(SessionExpiredError)
  const temp = await service({ data: null, error: 'x', status: 503 }).setFavorite('t', 'github:a/b/c', false).catch((e) => e)
  expect(temp).toBeInstanceOf(StoreUnavailableError)
  expect(temp.state).toBe('503')
})

test('listFavorites returns the entries', async () => {
  const favorites = [{ id: 'github:a/b/c', createdAt: '2026-11-14T00:00:00.000Z', resource: null }]
  expect(await service({ data: { favorites }, error: null }).listFavorites('t')).toEqual(favorites)
})
