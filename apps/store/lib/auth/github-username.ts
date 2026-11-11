interface AccountRow {
  providerId?: string | null
  userId?: string | null
  accessToken?: string | null
}

interface Queryable {
  query: (text: string, values: unknown[]) => Promise<unknown>
}

// Publishers are keyed by GitHub login, so it has to come from GitHub itself.
// `username` is declared `input: false` to keep clients from setting it, and
// Better Auth drops such fields from the provider profile too — on sign-up and
// on account linking alike — so mapProfileToUser cannot fill it.
export async function syncGithubUsername(
  account: AccountRow | null | undefined,
  db: Queryable,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!account || account.providerId !== 'github' || !account.userId || !account.accessToken) return
  try {
    const res = await fetchImpl('https://api.github.com/user', {
      headers: {
        authorization: `Bearer ${account.accessToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'agent-store',
      },
    })
    if (!res.ok) {
      console.error(`github username sync: GitHub answered ${res.status}`)
      return
    }
    const { login } = (await res.json()) as { login?: unknown }
    if (typeof login !== 'string' || !login) return
    await db.query('update "user" set username = $1 where id = $2 and username is distinct from $1', [
      login,
      account.userId,
    ])
  } catch (error) {
    // A failed sync must not fail the sign-in; the next GitHub sign-in retries.
    console.error('github username sync failed', error)
  }
}
