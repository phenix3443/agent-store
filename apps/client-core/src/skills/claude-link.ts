// Claude Code sees a store skill through a symlink
// ${CLAUDE_CONFIG_DIR:-~/.claude}/skills/<slug> → ~/.agents/skills/<slug>.
// Only that exact symlink is ever created or removed.
import { lstat, mkdir, readlink, symlink, unlink } from 'fs/promises'
import { join, resolve, dirname } from 'path'
import { SkillConflictError } from './store'

export function claudeSkillLink(claudeConfigDir: string, slug: string): string {
  return join(claudeConfigDir, 'skills', slug)
}

async function linkState(link: string, target: string): Promise<'absent' | 'ours' | 'other'> {
  let st
  try { st = await lstat(link) } catch { return 'absent' }
  if (!st.isSymbolicLink()) return 'other'
  return resolve(dirname(link), await readlink(link)) === resolve(target) ? 'ours' : 'other'
}

export async function linkClaudeSkill(claudeConfigDir: string, slug: string, target: string): Promise<void> {
  const link = claudeSkillLink(claudeConfigDir, slug)
  const state = await linkState(link, target)
  if (state === 'ours') return
  if (state === 'other') {
    throw new SkillConflictError(`${link} already exists and is not Agent Store's symlink; move it away, then run: as enable ${slug} --for claude`)
  }
  await mkdir(dirname(link), { recursive: true })
  await symlink(target, link, 'dir')
}

/** Removes our symlink; leaves anything else in place. Returns false when something else sits there. */
export async function unlinkClaudeSkill(claudeConfigDir: string, slug: string, target: string): Promise<boolean> {
  const link = claudeSkillLink(claudeConfigDir, slug)
  const state = await linkState(link, target)
  if (state === 'ours') await unlink(link)
  return state !== 'other'
}

export async function hasClaudeSkillLink(claudeConfigDir: string, slug: string, target: string): Promise<boolean> {
  return (await linkState(claudeSkillLink(claudeConfigDir, slug), target)) === 'ours'
}
