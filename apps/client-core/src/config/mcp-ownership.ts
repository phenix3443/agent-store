// MCP entry ownership shared by Claude Code and Codex (docs/global-skills-mcp.md §5.5).
// Each tool supplies how to read, add and remove one entry and how to trial a restore;
// the rules below are the same for both:
//   - ownership comes only from targets.json; a same-name entry without a record is
//     the user's and is a conflict unless --replace;
//   - --replace records the replaced entry before writing, and only proceeds after a
//     trial round-trip shows the CLI can put it back under the comparison rule;
//   - a remove-then-add that fails part way puts the old entry back;
//   - disable only removes an entry that still equals what we wrote, then restores
//     the replaced entry and checks it.
import { join } from 'path'
import type { ToolTarget } from '@as/types'
import { mcpEntriesEqual, mcpEntryDiff } from './mcp-compare'
import { readMcpTargets, writeMcpTargets, type McpTargetRecord } from './mcp-targets'
import { McpChangedOutsideError, McpConflictError, McpNotRestorableError, McpRestoreMismatchError } from './mcp-errors'

export interface McpEntryStore {
  tool: ToolTarget
  /** ~/.agents/mcps/<slug> */
  itemDir: string
  read(name: string): Promise<unknown>
  add(name: string, entry: unknown): Promise<void>
  remove(name: string): Promise<void>
  /** null: the CLI is not installed, so --replace cannot check the restore. */
  cli: {
    version(): Promise<string>
    /** Keys the CLI would not restore exactly. */
    trialRestore(name: string, previous: unknown): Promise<string[]>
  } | null
}

const LABEL = { claude: 'Claude', codex: 'Codex' } as const

async function restorePrevious(s: McpEntryStore, name: string, previous: unknown): Promise<void> {
  await s.add(name, previous)
  const back = await s.read(name)
  if (!mcpEntriesEqual(s.tool, back, previous)) {
    throw new McpRestoreMismatchError(s.tool, name, previous, mcpEntryDiff(s.tool, previous, back))
  }
}

/**
 * Undo a remove-then-add that failed part way. Either CLI call can change the file and
 * still exit non-zero, so act on what is actually there: leave it if it is still the old
 * entry, otherwise clear whatever is in place and write the old entry back.
 */
async function putBack(s: McpEntryStore, name: string, old: unknown): Promise<void> {
  const now = await s.read(name)
  if (mcpEntriesEqual(s.tool, now, old)) return
  if (now !== undefined) await s.remove(name)
  await restorePrevious(s, name, old)
}

async function saveRecord(s: McpEntryStore, record: McpTargetRecord | undefined): Promise<void> {
  const targets = await readMcpTargets(s.itemDir)
  if (record) targets[s.tool] = record
  else delete targets[s.tool]
  await writeMcpTargets(s.itemDir, targets)
}

/**
 * Our entry is in place. Ownership comes only from targets.json: without a record a
 * same-name entry is the user's, even when it equals what we would write (§5.5).
 * With a record it must equal `written`; while `written` is null (an enable that stopped
 * between the tool write and the record update) it must equal what that enable writes.
 */
function isOurs(tool: ToolTarget, current: unknown, record: McpTargetRecord | undefined, desired: unknown): boolean {
  if (current === undefined || !record) return false
  if (record.written != null) return mcpEntriesEqual(tool, current, record.written)
  return desired !== undefined && mcpEntriesEqual(tool, current, desired)
}

export async function enableMcpEntry(
  s: McpEntryStore,
  name: string,
  entry: unknown,
  opts: { replace?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  const { tool } = s
  const current = await s.read(name)
  const record = (await readMcpTargets(s.itemDir))[tool]
  const previous = record?.previous ?? null

  if (isOurs(tool, current, record, entry)) {
    if (opts.dryRun) return
    if (mcpEntriesEqual(tool, current, entry)) {
      if (record!.written == null) await saveRecord(s, { ...record!, written: current })
      return
    }
    // setConfig resync: still ours, so swap it for the new entry. targets.json keeps the
    // old entry until the new one is in, so a failure here can always be put back.
    try {
      await s.remove(name)
      await s.add(name, entry)
    } catch (e) {
      try {
        await putBack(s, name, current)
      } catch (restoreError) {
        throw new Error(`The ${LABEL[tool]} MCP entry "${name}" could not be swapped for the new config (${(e as Error).message}) and the old one could not be put back (${(restoreError as Error).message}); it is still recorded in ${join(s.itemDir, 'targets.json')}, and \`as sync\` writes it again`)
      }
      throw e
    }
    await saveRecord(s, { ...record!, written: await s.read(name) })
    return
  } else if (current !== undefined) {
    if (!opts.replace) {
      throw record?.written != null
        ? new McpChangedOutsideError(tool, name, 'changed')
        : new McpConflictError(tool, name)
    }
    if (previous !== null && record?.written != null) {
      // Our takeover was edited outside Agent Store; replacing it again would lose that edit.
      // (written === null means a takeover was interrupted: reuse the saved previous.)
      throw new Error(`The ${LABEL[tool]} MCP entry "${name}" was changed outside Agent Store after it replaced your entry; run \`as disable ${name} --for ${tool} --force\` to put your saved entry back first`)
    }
    let adopted = previous
    let cliVersion = record?.cliVersion
    if (adopted === null) {
      if (!s.cli) throw new McpNotRestorableError(tool, name, [`(the ${tool} CLI is not installed; --replace needs it to check the restore)`])
      const lost = await s.cli.trialRestore(name, current)
      if (lost.length) throw new McpNotRestorableError(tool, name, lost)
      adopted = current
      cliVersion = await s.cli.version()
    }
    if (opts.dryRun) return
    // Record what we replace before touching the file, so a crash cannot lose it.
    await saveRecord(s, { name, written: null, previous: adopted, cliVersion })
    try {
      await s.remove(name)
      await s.add(name, entry)
    } catch (e) {
      try {
        await putBack(s, name, adopted)
      } catch (restoreError) {
        // The record (written: null, previous) stays, so the replaced entry is not lost.
        throw new Error(`The ${LABEL[tool]} MCP entry "${name}" could not be replaced (${(e as Error).message}) and your entry could not be put back (${(restoreError as Error).message}); it is saved as "previous" in ${join(s.itemDir, 'targets.json')}, and \`as disable ${name} --for ${tool} --force\` writes it back`)
      }
      await saveRecord(s, undefined)
      throw e
    }
    await saveRecord(s, { name, written: await s.read(name), previous: adopted, cliVersion })
    return
  }

  if (opts.dryRun) return
  // Claim the name before writing it, so an entry left by an interrupted run is provably ours.
  if (!record) await saveRecord(s, { name, written: null, previous: null })
  try {
    await s.add(name, entry)
  } catch (e) {
    // Keep the claim if the entry got written anyway, so it is not mistaken for the user's.
    if (!record && (await s.read(name)) === undefined) await saveRecord(s, undefined)
    throw e
  }
  await saveRecord(s, { name, written: await s.read(name), previous, ...(record?.cliVersion ? { cliVersion: record.cliVersion } : {}) })
}

export async function disableMcpEntry(
  s: McpEntryStore,
  name: string,
  opts: { force?: boolean; expected?: unknown } = {}
): Promise<void> {
  const current = await s.read(name)
  const record = (await readMcpTargets(s.itemDir))[s.tool]
  if (!record && current === undefined) return
  // A claim from an enable that stopped before writing anything: nothing to remove.
  if (current === undefined && record?.written == null && record?.previous == null) {
    await saveRecord(s, undefined)
    return
  }

  if (!isOurs(s.tool, current, record, opts.expected) && !opts.force) {
    throw new McpChangedOutsideError(s.tool, name, current === undefined ? 'removed' : 'changed')
  }
  if (current !== undefined) await s.remove(name)
  if (record?.previous != null) {
    try {
      await restorePrevious(s, name, record.previous)
    } catch (e) {
      await saveRecord(s, { ...record, written: null })
      throw e
    }
  }
  await saveRecord(s, undefined)
}
