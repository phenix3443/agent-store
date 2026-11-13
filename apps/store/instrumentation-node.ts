import { existsSync } from 'node:fs'
import { appDbPath, missingAppDbMessage } from './lib/app-db'

// A missing app.db would otherwise only show up as every visitor being signed
// out, because getCurrentUser() treats any auth failure as "not logged in".
const path = appDbPath()
if (!existsSync(path)) {
  console.error(missingAppDbMessage(path))
  process.exit(1)
}
