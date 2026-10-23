import { existsSync } from 'fs'
import type { MigrateResult } from '@as/client-core'
import { EXIT_FAILURE, EXIT_OK, errorMessage } from '../utils/exit-codes'

/** Prints each step; exits non-zero when any skill could not be migrated. */
export async function runMigrateCommand(
  migrate: () => Promise<MigrateResult>,
  out: (s: string) => void = console.log,
  backupExists: (dir: string) => boolean = existsSync
): Promise<number> {
  let res: MigrateResult
  try {
    res = await migrate()
  } catch (err) {
    out(`  Migrate failed: ${errorMessage(err)}`)
    return EXIT_FAILURE
  }
  if (!res.steps.length) {
    out('  Nothing to migrate')
    return EXIT_OK
  }
  for (const s of res.steps) {
    out(`  ${s.result === 'error' ? 'ERROR' : s.result === 'done' ? 'done ' : 'skip '} [${s.slug}] ${s.message}`)
  }
  if (backupExists(res.backupDir)) out(`  Backup: ${res.backupDir}`)
  return res.steps.some(s => s.result === 'error') ? EXIT_FAILURE : EXIT_OK
}
