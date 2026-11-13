// Runs once when the server starts. A missing app.db would otherwise only show
// up as every visitor being signed out, because getCurrentUser() treats any
// auth failure as "not logged in".
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { existsSync } = await import('node:fs')
  const { appDbPath, missingAppDbMessage } = await import('./lib/app-db')
  const path = appDbPath()
  if (!existsSync(path)) {
    console.error(missingAppDbMessage(path))
    process.exit(1)
  }
}
