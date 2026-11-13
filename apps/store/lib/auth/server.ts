import { betterAuth } from 'better-auth'
import { jwt } from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'
import { openAppDb } from '../app-db'
import { syncGithubUsername } from './github-username'

// Self-hosted Better Auth. Its tables (user, session, account, verification,
// jwks) live in app.db, the SQLite file shared with the API, and are created by
// the API's drizzle migrations, not by Better Auth's own migrator: one migration
// source.
//
// The API never sees the session cookie. Browsers and the desktop app call
// /api/auth/token for a short-lived JWT (EdDSA), and the API verifies it against
// /api/auth/jwks. `username` is the GitHub login, carried in the token.
export function createAuth() {
  const baseURL = process.env.BETTER_AUTH_URL
  const db = openAppDb()
  return betterAuth({
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: db,
    databaseHooks: {
      account: {
        // create covers sign-up and linking GitHub to an existing user; update
        // runs on every later GitHub sign-in, which backfills older users and
        // follows a renamed login.
        create: { after: (account) => syncGithubUsername(account, db) },
        update: { after: (account) => syncGithubUsername(account, db) },
      },
    },
    user: {
      additionalFields: {
        username: { type: 'string', required: false, input: false },
      },
    },
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID ?? '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      },
      // Enabled only when GOOGLE_CLIENT_ID is set; without it the modal's Google
      // button lands on /?error=auth_failed.
      ...(process.env.GOOGLE_CLIENT_ID
        ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '' } }
        : {}),
    },
    plugins: [
      jwt({
        jwt: {
          issuer: baseURL,
          audience: baseURL,
          definePayload: ({ user }) => ({
            email: user.email,
            username: (user as { username?: string | null }).username ?? undefined,
          }),
        },
      }),
      // Must stay last: lets server actions set cookies through next/headers.
      nextCookies(),
    ],
  })
}

type Auth = ReturnType<typeof createAuth>

let instance: Auth | undefined

// Created on first use, not at import: `next build` imports this module while
// collecting routes, and the secret and app.db only exist at runtime.
export function auth(): Auth {
  if (!instance) instance = createAuth()
  return instance
}
