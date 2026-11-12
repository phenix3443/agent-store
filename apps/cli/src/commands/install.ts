import type { Engine, InstallOptions } from '@as/types'
import { formatStep } from '../utils/format'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, errorMessage } from '../utils/exit-codes'

export async function runInstall(
  engine: Engine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<number> {
  const usage = 'Usage: aas install <slug> [--target <claude|codex>] [--force]'
  const rest: string[] = []
  const options: InstallOptions = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--force') options.force = true
    else if (a === '--target') {
      const t = args[++i]
      if (t !== 'claude' && t !== 'codex') {
        out(`  Error: --target needs claude or codex`)
        out(usage)
        return EXIT_USAGE
      }
      options.target = t
    } else if (a.startsWith('-')) {
      out(`  Error: unknown option ${a}`)
      out(usage)
      return EXIT_USAGE
    } else rest.push(a)
  }
  const slug = rest[0]
  if (!slug) {
    out(usage)
    return EXIT_USAGE
  }
  if (rest.length > 1) {
    out(`${usage} (install takes one slug per command)`)
    return EXIT_USAGE
  }

  try {
    const result = await engine.installAndEnable(slug, options.target || options.force ? options : undefined)
    out(formatStep(`Fetching ${slug}@${result.version}...`, 'done'))
    out(formatStep('Running install hooks...', 'done'))
    out(formatStep(`Writing to ~/.agents/${result.category}s/${slug}/`))
    for (const target of result.enabled) out(formatStep(`Syncing to ${target}...`, 'done'))

    out('')
    out(`  Installed ${slug} ${result.version}`)
    for (const n of result.notEnabled) {
      out(`  Not enabled for ${n.target}: ${n.message}; then: aas enable ${slug} --for ${n.target}`)
    }
    return EXIT_OK
  } catch (err) {
    out(`  Error: ${errorMessage(err)}`)
    return EXIT_FAILURE
  }
}
