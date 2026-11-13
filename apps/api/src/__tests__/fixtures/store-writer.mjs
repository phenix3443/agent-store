// Plays the store's side of app.db in app-db.test.ts: run under Node, it opens the
// file through the store's own openAppDb and writes Better Auth-shaped rows in
// transactions that read before they write, as Better Auth's do.
//
// Usage: node --experimental-strip-types store-writer.mjs <app.db> <count>
import { openAppDb } from '../../../../store/lib/app-db.ts'

const [path, countArg] = process.argv.slice(2)
const count = Number(countArg)
const db = openAppDb(path)

const begin = db.prepare('begin')
const commit = db.prepare('commit')
const countWebhooks = db.prepare('select count(*) as n from processed_webhooks')
const insertUser = db.prepare(
  'insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (?, ?, ?, 0, ?, ?)',
)
const insertSession = db.prepare(
  'insert into session (id, "expiresAt", token, "createdAt", "updatedAt", "userId") values (?, ?, ?, ?, ?, ?)',
)

process.stdout.write('ready\n')

let sawApiWrites = 0
for (let i = 0; i < count; i++) {
  const now = new Date().toISOString()
  begin.run()
  sawApiWrites = Number(countWebhooks.get().n)
  insertUser.run(`u${i}`, `user ${i}`, `u${i}@example.com`, now, now)
  insertSession.run(`s${i}`, now, `t${i}`, now, now, `u${i}`)
  commit.run()
}
db.close()
process.stdout.write(`${JSON.stringify({ sawApiWrites })}\n`)
