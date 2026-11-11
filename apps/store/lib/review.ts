import type { Item } from '@as/types'

export type ReviewVerdict = 'passed' | 'flagged' | 'pending'

/** No review data is "pending", never "passed": only a clean low-risk review earns the stamp. */
export function reviewVerdict(item: Pick<Item, 'review'>): ReviewVerdict {
  const review = item.review
  if (!review) return 'pending'
  if (review.risk === 'low' && (review.concerns?.length ?? 0) === 0) return 'passed'
  return 'flagged'
}

export function installCommand(item: Pick<Item, 'slug'>): string {
  return `aas install ${item.slug}`
}

export type RunKind = 'command' | 'connect' | 'file' | 'download' | 'config' | 'provider'
export interface RunEntry {
  kind: RunKind
  /** Literal text shown in monospace; absent for the provider note, which is translated copy. */
  value?: string
  dest?: string
}

/** Everything the manifest says will run or be written at install time. */
export function runEntries(item: Item): RunEntry[] {
  const entries: RunEntry[] = []
  const steps = item.installHook?.steps ?? []
  if (item.category === 'mcp') {
    if (item.transport === 'stdio') {
      if (item.serverCommand) entries.push({ kind: 'command', value: item.serverCommand })
    } else if (item.url) {
      entries.push({ kind: 'connect', value: item.url })
    }
  } else if (item.category === 'skill') {
    const inSteps = steps.some((s) => s.type === 'file' && s.url === item.contentUrl)
    if (item.contentUrl && !inSteps) entries.push({ kind: 'file', value: item.contentUrl })
  } else {
    entries.push({ kind: 'provider' })
  }
  for (const step of steps) {
    if (step.type === 'file') entries.push({ kind: 'download', value: step.url, dest: step.dest })
    else entries.push({ kind: 'config', value: Object.keys(step.patch).join(', ') })
  }
  return entries.filter((e, i, all) => all.findIndex((o) => o.kind === e.kind && o.value === e.value) === i)
}
