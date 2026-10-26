import type { Engine } from '@as/types'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, errorMessage } from '../utils/exit-codes'

export async function runUninstall(
  engine: Engine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<number> {
  const slug = args[0]
  if (!slug) {
    out('Usage: aas uninstall <slug>')
    return EXIT_USAGE
  }
  try {
    await engine.uninstall(slug)
    out(`  Uninstalled ${slug}`)
    return EXIT_OK
  } catch (err) {
    out(`  Error: ${errorMessage(err)}`)
    return EXIT_FAILURE
  }
}
