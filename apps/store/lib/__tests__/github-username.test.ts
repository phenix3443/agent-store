import { describe, expect, mock, test } from 'bun:test'
import { syncGithubUsername } from '../auth/github-username'

const githubAccount = { providerId: 'github', userId: 'u1', accessToken: 'tok' }

// Stands in for DatabaseSync: records each statement and its bound values.
function fakeDb() {
  const run = mock((..._values: string[]) => undefined)
  const prepare = mock((_sql: string) => ({ run }))
  return { db: { prepare }, run }
}

function githubAnswers(body: unknown, status = 200) {
  return mock(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

describe('syncGithubUsername', () => {
  test('writes the GitHub login onto the user the account belongs to', async () => {
    const { db, run } = fakeDb()
    const fetchImpl = githubAnswers({ login: 'octocat' })

    await syncGithubUsername(githubAccount, db, fetchImpl)

    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0]).toEqual(['octocat', 'u1', 'octocat'])
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof mock>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/user')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
  })

  test('leaves accounts from other providers alone', async () => {
    const { db, run } = fakeDb()
    const fetchImpl = githubAnswers({ login: 'octocat' })

    await syncGithubUsername({ ...githubAccount, providerId: 'google' }, db, fetchImpl)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  test('does nothing without an access token', async () => {
    const { db, run } = fakeDb()
    await syncGithubUsername({ ...githubAccount, accessToken: null }, db, githubAnswers({ login: 'octocat' }))
    expect(run).not.toHaveBeenCalled()
  })

  test('does not write when GitHub rejects the token', async () => {
    const { db, run } = fakeDb()
    await syncGithubUsername(githubAccount, db, githubAnswers({ message: 'Bad credentials' }, 401))
    expect(run).not.toHaveBeenCalled()
  })

  test('swallows a network failure so sign-in still completes', async () => {
    const { db, run } = fakeDb()
    const failing = mock(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch

    await expect(syncGithubUsername(githubAccount, db, failing)).resolves.toBeUndefined()
    expect(run).not.toHaveBeenCalled()
  })
})
