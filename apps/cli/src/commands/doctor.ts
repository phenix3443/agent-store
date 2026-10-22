import type { DoctorFinding } from '@as/client-core'
import { EXIT_FAILURE, EXIT_OK, errorMessage } from '../utils/exit-codes'

/** Prints each finding; exits non-zero when a tool does not see what the registry says. */
export async function runDoctorCommand(
  doctor: () => Promise<DoctorFinding[]>,
  out: (s: string) => void = console.log
): Promise<number> {
  let findings: DoctorFinding[]
  try {
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
