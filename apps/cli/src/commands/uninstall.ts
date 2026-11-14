import type { Engine, ToolTarget } from '@as/types'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, errorMessage } from '../utils/exit-codes'

const USAGE = 'Usage: aas uninstall <slug> [--project <id|dir> [--target <claude|codex>]] [--force]'

export async function runUninstall(
  engine: Engine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<number> {
  const rest: string[] = []
  let force = false
  let project: string | undefined
  let target: ToolTarget | undefined
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--force') force = true
    else if (a === '--project') project = args[++i]
    else if (a === '--target') {
      const t = args[++i]
      if (t !== 'claude' && t !== 'codex') { out('  Error: --target needs claude or codex'); out(USAGE); return EXIT_USAGE }
      target = t
    } else if (a.startsWith('-')) { out(`  Error: unknown option ${a}`); out(USAGE); return EXIT_USAGE }
    else rest.push(a)
  }
  const slug = rest[0]
  if (!slug || rest.length > 1 || (args.includes('--project') && !project) || (target && !project)) {
    out(USAGE)
    return EXIT_USAGE
  }
  try {
    if (project) {
      const { removed } = await engine.uninstallFromProject(project, slug, {
        ...(target ? { targets: [target] } : {}),
        ...(force ? { force: true } : {}),
      })
      for (const r of removed) out(`  Removed ${slug} from ${r.file}`)
      return EXIT_OK
    }
    await engine.uninstall(slug, force ? { force: true } : undefined)
    out(`  Uninstalled ${slug}`)
    return EXIT_OK
  } catch (err) {
    out(`  Error: ${errorMessage(err)}`)
    return EXIT_FAILURE
  }
}
