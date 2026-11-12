import type { Engine, UpdateResult } from '@as/types'
import { EXIT_FAILURE, EXIT_OK, errorMessage } from '../utils/exit-codes'

export async function runUpdate(
  engine: Engine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<number> {
  const slug = args[0]
  let results: UpdateResult[]
  try {
    results = await engine.update(slug)
  } catch (err) {
    const failed = err as { updated?: UpdateResult[]; failures?: Array<{ slug: string; error: string }> }
    for (const r of failed.updated ?? []) out(`  Updated ${r.slug} from ${r.fromVersion} to ${r.toVersion}`)
    if (failed.failures) {
      for (const f of failed.failures) out(`  Error: ${f.slug} was not updated: ${f.error}`)
    } else {
      out(`  Error: ${errorMessage(err)}`)
    }
    return EXIT_FAILURE
  }
  if (!results.length) {
    out('  No updates available.')
    return EXIT_OK
  }
  for (const r of results) {
    out(`  Updated ${r.slug} from ${r.fromVersion} to ${r.toVersion}`)
  }
  return EXIT_OK
}
