import { existsSync } from 'node:fs'
import { appDbPath, openAppDb } from './db/client'

/**
 * Writes a consistent copy of app.db to `out` with VACUUM INTO, which reads one
 * snapshot while the API and the store keep writing. Refuses to overwrite `out`.
 */
export function snapshotAppDb(source: string, out: string): void {
  if (existsSync(out)) throw new Error(`${out} already exists`)
  const sqlite = openAppDb(source)
  try {
    sqlite.query('VACUUM INTO ?').run(out)
  } finally {
    sqlite.close()
  }
}

// Usage: bun src/snapshot.ts <output path>. The backup timer on the netcup host
// runs it through `kubectl exec`, copies the file out and checks the exit code.
if (import.meta.main) {
  const out = process.argv[2]
  if (!out) {
    console.error('usage: bun src/snapshot.ts <output path>')
    process.exit(2)
  }
  try {
    const source = appDbPath()
    snapshotAppDb(source, out)
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: 'info', message: 'snapshot written', source, out }))
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', message: 'snapshot failed', cause: String(error) }))
    process.exit(1)
  }
}
