import type { Engine, ToolTarget } from '@as/types'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, errorMessage } from '../utils/exit-codes'

const TARGETS: readonly string[] = ['claude', 'codex']

function getFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

export async function runEnable(
  engine: Engine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<number> {
  const slug = args[0]
  const target = getFlag(args, '--for') as ToolTarget | undefined
  if (!slug || !target || !TARGETS.includes(target)) {
    out('Usage: aas enable <slug> --for <claude|codex> [--replace] [--force]')
    return EXIT_USAGE
  }
  try {
    const options = { ...(args.includes('--replace') ? { replace: true } : {}), ...(args.includes('--force') ? { force: true } : {}) }
    await engine.enable(slug, target, Object.keys(options).length ? options : undefined)
    out(`  ${slug} enabled for ${target}`)
    return EXIT_OK
  } catch (err) {
    out(`  Error: ${errorMessage(err)}`)
    return EXIT_FAILURE
  }
}
