// Deploying a library skill into one tool's skills directory, and taking it
// back out, without ever destroying something that is not ours. Ported from
// skills-manager (https://github.com/xingkongliang/skills-manager, MIT,
// src-tauri/src/core/sync_engine.rs): classify the target without following
// links, then let the caller's authorization decide what may be replaced.
import { cp, lstat, mkdir, readdir, readlink, realpath, rm, symlink, unlink } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import type { SkillDeployment, ToolTarget } from '@as/types'
import { MARKER } from './store'

/** What is at a deployment target right now, from lstat only. */
export type TargetState =
  /** Nothing there; deploying cannot destroy anything. */
  | 'absent'
  /** A link resolving to the library directory: ours by construction. */
  | 'link-to-source'
  /** A link pointing elsewhere, or dangling. The link itself is the user's configuration. */
  | 'foreign-link'
  /** A real directory: a copy-mode deployment or the user's own skill. */
  | 'real-dir'
  /** A real file. We never deploy one, so it is always the user's. */
  | 'real-file'

/**
 * What the caller may destroy at the target.
 * - `no-clobber`: only what is provably ours (nothing, or our own link);
 * - `recorded`: a deployment record claims this path, and it only vouches for an
 *   object of its recorded mode (a symlink record never authorizes deleting a
 *   real directory that replaced our link);
 * - `user-confirmed`: an explicit `--force`.
 */
export type ReplacePolicy =
  | { kind: 'no-clobber' }
  | { kind: 'recorded'; mode: SkillDeployment['mode'] }
  | { kind: 'user-confirmed' }

export const NO_CLOBBER: ReplacePolicy = { kind: 'no-clobber' }
export const USER_CONFIRMED: ReplacePolicy = { kind: 'user-confirmed' }
export const recorded = (mode: SkillDeployment['mode']): ReplacePolicy => ({ kind: 'recorded', mode })

export function permits(policy: ReplacePolicy, state: TargetState): boolean {
  switch (state) {
    case 'absent':
    case 'link-to-source':
      return true
    case 'foreign-link':
      // Our own link dangles after the library moves, so a symlink record still covers a link.
      return policy.kind === 'user-confirmed' || (policy.kind === 'recorded' && policy.mode === 'symlink')
    case 'real-dir':
      return policy.kind === 'user-confirmed' || (policy.kind === 'recorded' && policy.mode === 'copy')
    case 'real-file':
      return policy.kind === 'user-confirmed'
  }
}

export type RefusalReason = 'not-managed' | 'record-mismatch' | 'cannot-replace'

function refusalReason(policy: ReplacePolicy): RefusalReason {
  return policy.kind === 'no-clobber' ? 'not-managed' : policy.kind === 'recorded' ? 'record-mismatch' : 'cannot-replace'
}

const DESCRIBE: Record<RefusalReason, string> = {
  'not-managed': 'is not managed by Agent Store',
  'record-mismatch': 'does not match the deployment Agent Store recorded',
  'cannot-replace': 'cannot be replaced',
}

const TOOL = { claude: 'Claude Code', codex: 'Codex' } as const

/** A write or removal was refused because the target is not ours to destroy. Nothing was changed. */
export class SkillDeployRefusedError extends Error {
  constructor(
    readonly target: string,
    readonly state: TargetState,
    readonly reason: RefusalReason,
    readonly tool: ToolTarget,
    readonly slug: string,
  ) {
    super(
      `Refusing to replace ${target} for ${TOOL[tool]}: it ${DESCRIBE[reason]} (${state}). It was left untouched; ` +
      `move it aside and run: aas enable ${slug} --for ${tool}, or pass --force to replace it`,
    )
    this.name = 'SkillDeployRefusedError'
  }
}

async function pointsTo(link: string, source: string): Promise<boolean> {
  let target: string
  try { target = await readlink(link) } catch { return false }
  const resolved = resolve(dirname(link), target)
  if (resolved === resolve(source)) return true
  try {
    return (await realpath(resolved)) === (await realpath(source))
  } catch {
    return false
  }
}

/**
 * `source` is only used to recognize a link that already points at it; without
 * one every link is foreign, so no path can be mistaken for ours.
 */
export async function classifyTarget(target: string, source?: string): Promise<TargetState> {
  let st
  try {
    st = await lstat(target)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 'absent'
    throw new Error(`Cannot inspect ${target}: ${(e as Error).message}`)
  }
  if (st.isSymbolicLink()) return source !== undefined && (await pointsTo(target, source)) ? 'link-to-source' : 'foreign-link'
  return st.isDirectory() ? 'real-dir' : 'real-file'
}

/**
 * Removes what was classified, with an operation that only works on that kind of
 * object: a real directory that replaced a link since the check makes `unlink`
 * fail instead of being deleted.
 */
export async function removeClassified(target: string, state: TargetState): Promise<void> {
  switch (state) {
    case 'absent':
      return
    case 'link-to-source':
    case 'foreign-link':
    case 'real-file':
      try {
        await unlink(target)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      }
      return
    case 'real-dir':
      await rm(target, { recursive: true })
  }
}

export function authorize(target: string, state: TargetState, policy: ReplacePolicy, tool: ToolTarget, slug: string): void {
  if (!permits(policy, state)) throw new SkillDeployRefusedError(target, state, refusalReason(policy), tool, slug)
}

/** The mode to deploy in: symlink, unless AS_SKILL_DEPLOY_MODE=copy asks for copies. */
export function preferredMode(env: NodeJS.ProcessEnv = process.env): SkillDeployment['mode'] {
  return env['AS_SKILL_DEPLOY_MODE'] === 'copy' ? 'copy' : 'symlink'
}

// Symlinks fail without the privilege on Windows and on some filesystems; a copy works everywhere.
const LINK_UNSUPPORTED = new Set(['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL', 'EXDEV'])

async function copySkill(source: string, target: string): Promise<void> {
  await cp(source, target, {
    recursive: true,
    verbatimSymlinks: true,
    errorOnExist: true,
    force: false,
    filter: from => resolve(from) !== resolve(join(source, MARKER)),
  })
}

/** A copy deployment counts as current when it still exists and was made from the same content. */
export async function isCurrent(source: string, record: SkillDeployment | undefined, mode: SkillDeployment['mode'], sourceHash: string): Promise<boolean> {
  if (!record) return false
  if (mode === 'symlink') return record.mode === 'symlink' && (await classifyTarget(record.path, source)) === 'link-to-source'
  return record.mode === 'copy' && record.sourceHash === sourceHash && (await classifyTarget(record.path, source)) === 'real-dir'
}

/**
 * Puts `source` at `target`. The policy is checked right before anything is
 * removed, because the disk can change between a preflight and the write.
 * Returns the mode actually used (a failed symlink falls back to a copy).
 */
export async function deploySkillDir(
  source: string, target: string, mode: SkillDeployment['mode'], policy: ReplacePolicy, tool: ToolTarget, slug: string,
): Promise<SkillDeployment['mode']> {
  const state = await classifyTarget(target, source)
  if (mode === 'symlink' && state === 'link-to-source') return 'symlink'
  authorize(target, state, policy, tool, slug)
  await mkdir(dirname(target), { recursive: true })
  await removeClassified(target, state)
  if (mode === 'copy') {
    await copySkill(source, target)
    return 'copy'
  }
  try {
    await symlink(source, target, 'dir')
    return 'symlink'
  } catch (e) {
    if (!LINK_UNSUPPORTED.has((e as NodeJS.ErrnoException).code ?? '')) throw e
    await copySkill(source, target)
    return 'copy'
  }
}

/**
 * Removes a recorded deployment while the disk still matches the record (or
 * with `force`). Returns false, leaving it in place, when something else has
 * taken the path over.
 */
export async function removeRecordedDeployment(record: SkillDeployment, force = false): Promise<{ removed: boolean; state: TargetState }> {
  const state = await classifyTarget(record.path)
  if (state === 'absent') return { removed: true, state }
  if (!permits(force ? USER_CONFIRMED : recorded(record.mode), state)) return { removed: false, state }
  await removeClassified(record.path, state)
  return { removed: true, state }
}

/** Names of the entries in a tool's skills directory, for name-clash checks. */
export async function listDir(dir: string): Promise<string[]> {
  try { return await readdir(dir) } catch { return [] }
}
