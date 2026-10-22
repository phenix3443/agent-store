import type { Engine } from '@as/types'
import { formatStep } from '../utils/format'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, errorMessage } from '../utils/exit-codes'

export async function runInstall(
  engine: Engine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<number> {
  const option = args.find(a => a.startsWith('-'))
  if (option) {
    out(`  Error: unknown option ${option}`)
    out('Usage: aas install <slug>')
    return EXIT_USAGE
  }
  const slug = args[0]
  if (!slug) {
    out('Usage: aas install <slug>')
    return EXIT_USAGE
  }
  if (args.length > 1) {
    out('Usage: aas install <slug> (install takes one slug per command)')
    return EXIT_USAGE
  }

  try {
    const result = await engine.install(slug)
    out(formatStep(`Fetching ${slug}@${result.version}...`, 'done'))
    out(formatStep('Running install hooks...', 'done'))

    const detail = await engine.info(slug)
    out(formatStep(`Writing to ~/.agents/${detail.category}s/${slug}/`))

    for (const target of detail.compatibleWith) {
      await engine.enable(slug, target)
      out(formatStep(`Syncing to ${target}...`, 'done'))
    }

    out('')
    out(`  Installed ${slug} ${result.version}`)

    if (detail.category === 'provider' || detail.category === 'mcp') {
      out(`  ⚠ Configuration required — run: aas config ${slug}`)
    }
    return EXIT_OK
  } catch (err) {
    out(`  Error: ${errorMessage(err)}`)
    return EXIT_FAILURE
  }
}
