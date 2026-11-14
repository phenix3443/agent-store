// CI only (store-screenshots.yml): adds signed-in demo users to an app.db built by
// ci-app-db.mjs and prints their session cookies as JSON, {"free": "...", "pro": "...", ...}.
// ci-entitlements-proxy.mjs answers each user's plan and subscription from the
// first word of their email (free, pro, canceling, canceled).
// The cookie is Better Auth's: "<token>.<base64 HMAC-SHA256 of token>", URL-encoded.
//
// Usage: BETTER_AUTH_SECRET=... node scripts/ci-demo-session.mjs <app.db>
import { createHmac, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const file = process.argv[2]
const secret = process.env.BETTER_AUTH_SECRET
if (!file || !secret) {
  console.error('usage: BETTER_AUTH_SECRET=... node scripts/ci-demo-session.mjs <app.db>')
  process.exit(2)
}

const db = new DatabaseSync(file)
const now = new Date().toISOString()
const expires = new Date(Date.now() + 7 * 864e5).toISOString()
const cookies = {}
for (const plan of ['free', 'pro', 'canceling', 'canceled']) {
  const userId = randomUUID()
  const token = randomUUID().replaceAll('-', '')
  db.prepare('INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt, username) VALUES (?, ?, ?, 1, NULL, ?, ?, ?)').run(
    userId, `Demo ${plan}`, `${plan}-demo@example.com`, now, now, `demo-${plan}`,
  )
  db.prepare('INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)').run(
    randomUUID(), `demo-${plan}`, 'github', userId, now, now,
  )
  db.prepare('INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)').run(
    randomUUID(), expires, token, now, now, userId,
  )
  const signature = createHmac('sha256', secret).update(token).digest('base64')
  cookies[plan] = encodeURIComponent(`${token}.${signature}`)
}
db.close()
console.log(JSON.stringify(cookies))
