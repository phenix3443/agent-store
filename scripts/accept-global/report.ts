// PASS/FAIL/SKIP bookkeeping and the exit code rule: 0 only if every required
// item passed, 1 on any FAIL, 2 (INCOMPLETE) if a required item was skipped.
export type Status = 'PASS' | 'FAIL' | 'SKIP'
export type Section = 'setup' | 'recognition' | 'lifecycle' | 'usage' | 'restore' | 'cleanup'

export interface ReportItem {
  section: Section
  name: string
  status: Status
  required: boolean
  detail?: string
}

export const EXIT_PASS = 0
export const EXIT_FAIL = 1
export const EXIT_INCOMPLETE = 2

export class Reporter {
  readonly items: ReportItem[] = []

  constructor(private readonly log: (line: string) => void = line => console.error(line)) {}

  record(section: Section, name: string, status: Status, detail?: string, required = true): ReportItem {
    const item: ReportItem = { section, name, status, required, ...(detail ? { detail } : {}) }
    this.items.push(item)
    const mark = status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : 'SKIP'
    this.log(`[${mark}] ${section}: ${name}${detail ? ` — ${detail}` : ''}`)
    return item
  }

  check(section: Section, name: string, ok: boolean, detail?: string): boolean {
    this.record(section, name, ok ? 'PASS' : 'FAIL', detail)
    return ok
  }

  exitCode(): number {
    if (this.items.some(i => i.status === 'FAIL')) return EXIT_FAIL
    if (this.items.some(i => i.status === 'SKIP' && i.required)) return EXIT_INCOMPLETE
    return EXIT_PASS
  }

  summary(): Record<string, unknown> {
    const sections: Record<string, ReportItem[]> = {}
    for (const item of this.items) (sections[item.section] ??= []).push(item)
    const count = (s: Status) => this.items.filter(i => i.status === s).length
    const code = this.exitCode()
    return {
      result: code === EXIT_PASS ? 'PASS' : code === EXIT_FAIL ? 'FAIL' : 'INCOMPLETE',
      exitCode: code,
      counts: { pass: count('PASS'), fail: count('FAIL'), skip: count('SKIP') },
      ...sections,
    }
  }
}
