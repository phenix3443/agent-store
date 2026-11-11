import { describe, expect, mock, test } from 'bun:test'
import { syncGithubUsername } from '../auth/github-username'

const githubAccount = { providerId: 'github', userId: 'u1', accessToken: 'tok' }

function githubAnswers(body: unknown, status = 200) {
  return mock(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

describe('syncGithubUsername', () => {
  test('writes the GitHub login onto the user the account belongs to', async () => {
    const query = mock(async (_text: string, _values: unknown[]) => undefined)
    const fetchImpl = githubAnswers({ login: 'octocat' })

    await syncGithubUsername(githubAccount, { query }, fetchImpl)

    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]?.[1]).toEqual(['octocat', 'u1'])
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof mock>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/user')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
  })

  test('leaves accounts from other providers alone', async () => {
    const query = mock(async (_text: string, _values: unknown[]) => undefined)
    const fetchImpl = githubAnswers({ login: 'octocat' })

    await syncGithubUsername({ ...githubAccount, providerId: 'google' }, { query }, fetchImpl)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })

  test('does nothing without an access token', async () => {
    const query = mock(async (_text: string, _values: unknown[]) => undefined)
    await syncGithubUsername({ ...githubAccount, accessToken: null }, { query }, githubAnswers({ login: 'octocat' }))
    expect(query).not.toHaveBeenCalled()
  })

  test('does not write when GitHub rejects the token', async () => {
    const query = mock(async (_text: string, _values: unknown[]) => undefined)
    await syncGithubUsername(githubAccount, { query }, githubAnswers({ message: 'Bad credentials' }, 401))
    expect(query).not.toHaveBeenCalled()
  })

  test('swallows a network failure so sign-in still completes', async () => {
    const query = mock(async (_text: string, _values: unknown[]) => undefined)
    const failing = mock(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch

    await expect(syncGithubUsername(githubAccount, { query }, failing)).resolves.toBeUndefined()
    expect(query).not.toHaveBeenCalled()
  })
})
