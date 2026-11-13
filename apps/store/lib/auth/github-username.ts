interface AccountRow {
  providerId?: string | null
  userId?: string | null
  accessToken?: string | null
}

// The slice of node:sqlite's DatabaseSync this needs; tests pass a fake.
interface Writable {
  prepare: (sql: string) => { run: (...values: string[]) => unknown }
}

// The GitHub login names the user on their dashboard, so it has to come from
// GitHub itself.
// `username` is declared `input: false` to keep clients from setting it, and
// Better Auth drops such fields from the provider profile too — on sign-up and
// on account linking alike — so mapProfileToUser cannot fill it.
export async function syncGithubUsername(
  account: AccountRow | null | undefined,
  db: Writable,
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
    db.prepare('update "user" set username = ? where id = ? and username is not ?').run(login, account.userId, login)
  } catch (error) {
    // A failed sync must not fail the sign-in; the next GitHub sign-in retries.
    console.error('github username sync failed', error)
  }
}
