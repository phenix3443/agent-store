import type { DoctorFinding } from '@as/client-core'
import type { AgentDetection } from '@as/types'
import { EXIT_FAILURE, EXIT_OK, errorMessage } from '../utils/exit-codes'

const AGENT = { claude: 'Claude Code', codex: 'Codex' } as const

/** Prints what was detected and each finding; exits non-zero when a tool does not see what the registry says. */
export async function runDoctorCommand(
  doctor: () => Promise<DoctorFinding[]>,
  out: (s: string) => void = console.log,
  detect?: () => Promise<AgentDetection[]>
): Promise<number> {
  let findings: DoctorFinding[]
  try {
    for (const a of detect ? await detect() : []) {
      const cli = a.binary ? `${a.binary}${a.version ? ` (${a.version})` : ''}` : 'CLI not on PATH, config files are edited directly'
      out(`  ${AGENT[a.agent].padEnd(11)} ${a.detected ? 'found' : 'not found'}: ${cli}; ${a.configDir}${a.configDirExists ? '' : ' (missing)'}`)
    }
    findings = await doctor()
  } catch (err) {
    out(`  Doctor failed: ${errorMessage(err)}`)
    return EXIT_FAILURE
  }
  if (!findings.length) {
    out('  No problems found')
    return EXIT_OK
  }
  for (const f of findings) {
    out(`  ${f.level === 'error' ? 'ERROR' : 'warn '} ${f.code}${f.slug ? ` [${f.slug}]` : ''}: ${f.message}`)
  }
  const errors = findings.filter(f => f.level === 'error').length
  out(`  ${errors} error${errors === 1 ? '' : 's'}, ${findings.length - errors} warning${findings.length - errors === 1 ? '' : 's'}`)
  return errors ? EXIT_FAILURE : EXIT_OK
}
