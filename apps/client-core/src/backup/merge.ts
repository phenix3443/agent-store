// Per-item three-way merge on git object ids. An item has two parts compared on
// their own: its content (files, manifest, config) and its per-agent enabled flags,
// so a toggle on one device and an edit on another combine.
import type { BackupConflictReason } from '@as/types'
import type { ItemIds } from './repo'

export type Side = 'local' | 'remote'
export type Part = 'content' | 'state'

export interface Decision {
  key: string
  /** Which side each part of the merged tree takes; `remote` also covers "no difference". */
  take: Record<Part, Side>
  /** Pending: the merged tree keeps the remote version, this machine keeps its own. */
  conflict?: { reason: BackupConflictReason; parts: Part[] }
  /** A too-large placeholder is involved: the remote content is never written over the local skill. */
  keepLocalContent?: boolean
}

export interface MergeInput {
  base: Map<string, ItemIds>
  local: Map<string, ItemIds>
  remote: Map<string, ItemIds>
  /** Unresolved conflicts from earlier runs. */
  pending: Set<string>
  /** Local copy is not trusted to say anything (a remote change that failed to apply, an item that cannot be restored here). */
  localIsBase: Set<string>
}

const PARTS: Part[] = ['content', 'state']

const same = (a: ItemIds | undefined, b: ItemIds | undefined) =>
  a?.content === b?.content && a?.state === b?.state

const placeholder = (key: string, ids: ItemIds | undefined) => !!ids && key.startsWith('skill/') && !ids.hasFiles

function frozen(key: string, reason: BackupConflictReason, parts: Part[]): Decision {
  return { key, take: { content: 'remote', state: 'remote' }, conflict: { reason, parts } }
}

function both(key: string, side: Side): Decision {
  return { key, take: { content: side, state: side } }
}

export function decideItem(key: string, base: ItemIds | undefined, localIn: ItemIds | undefined, remote: ItemIds | undefined, input: Pick<MergeInput, 'pending' | 'localIsBase'>): Decision {
  const local = input.localIsBase.has(key) ? base : localIn
  if (input.pending.has(key)) {
    if (same(local, remote)) return both(key, 'remote')
    const parts = local && remote ? PARTS.filter(p => local[p] !== remote[p]) : PARTS
    return frozen(key, !local ? 'deleted-here' : !remote ? 'deleted-there' : 'both-changed', parts)
  }
  if (same(local, remote)) return both(key, 'remote')
  if (!local) {
    if (!base) return both(key, 'remote')
    return same(remote, base) ? both(key, 'local') : frozen(key, 'deleted-here', PARTS)
  }
  if (!remote) {
    if (!base) return both(key, 'local')
    return same(local, base) ? both(key, 'remote') : frozen(key, 'deleted-there', PARTS)
  }
  const take: Record<Part, Side> = { content: 'remote', state: 'remote' }
  const conflicting: Part[] = []
  for (const part of PARTS) {
    const l = local[part]
    const r = remote[part]
    const b = base?.[part]
    if (l === r) continue
    if (base && r === b) take[part] = 'local'
    else if (base && l === b) take[part] = 'remote'
    else conflicting.push(part)
  }
  const decision: Decision = { key, take }
  if (placeholder(key, local) || placeholder(key, remote)) {
    // Real content beats a placeholder; between two placeholders this machine's stands.
    if (local.content !== remote.content) take.content = !placeholder(key, local) || placeholder(key, remote) ? 'local' : 'remote'
    decision.keepLocalContent = true
    const i = conflicting.indexOf('content')
    if (i !== -1) conflicting.splice(i, 1)
  }
  if (conflicting.length) return frozen(key, 'both-changed', conflicting)
  return decision
}

export function decide(input: MergeInput): Decision[] {
  const keys = new Set([...input.base.keys(), ...input.local.keys(), ...input.remote.keys()])
  return [...keys].sort().map(key => decideItem(key, input.base.get(key), input.local.get(key), input.remote.get(key), input))
}
