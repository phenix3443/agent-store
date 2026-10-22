// `as doctor`: compares what Agent Store recorded (registry.json, skill markers,
// MCP targets.json) with what each tool actually reads, without changing
// anything. See docs/global-skills-mcp.md §7 (PR7).
import { lstat, readdir, readFile } from 'fs/promises'
import { join } from 'path'
import type { InstalledItem, ToolTarget } from '@as/types'
import { readRegistry } from './registry'
import { itemDir } from './paths'
import { contentHash, isLegacyInstall, parseFrontmatter, readMarker, skillStoreDir } from './skills/store'
import { claudeSkillLink, hasClaudeSkillLink } from './skills/claude-link'
import { readMcpTargets } from './config/mcp-targets'
import { readClaudeMcpEntry } from './config/claude-mcp'
import { readCodexMcpEntry } from './config/codex-mcp'
import { mcpEntryDiff } from './config/mcp-compare'

export interface DoctorPaths {
  aasHome: string
  claudeConfigDir: string
  claudeJsonPath: string
  codexConfigDir: string
}

export interface DoctorFinding {
  /** error: a tool does not see what the registry says; warn: works, but needs attention. */
  level: 'error' | 'warn'
  code: string
  slug?: string
  message: string
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch { return false }
}

async function isRealDir(path: string): Promise<boolean> {
  try { const st = await lstat(path); return st.isDirectory() && !st.isSymbolicLink() } catch { return false }
}

/** Directories in `roots` whose SKILL.md frontmatter `name` is `name`, other than `own`. */
async function sameNamedSkills(roots: string[], name: string, own: string): Promise<string[]> {
  const found: string[] = []
  for (const root of roots) {
    let entries: string[]
    try { entries = await readdir(root) } catch { continue }
    for (const entry of entries) {
      const dir = join(root, entry)
      if (dir === own || entry.startsWith('.')) continue
      try {
        if (parseFrontmatter(await readFile(join(dir, 'SKILL.md'), 'utf-8'))?.name === name) found.push(dir)
      } catch { /* not a skill */ }
    }
  }
  return found
}

async function checkSkill(p: DoctorPaths, entry: InstalledItem, out: DoctorFinding[]): Promise<void> {
  const slug = entry.slug
  const dir = itemDir(p.aasHome, 'skill', slug)
  const add = (level: DoctorFinding['level'], code: string, message: string) => out.push({ level, code, slug, message })

  const legacyClaude = join(p.claudeConfigDir, 'skills', slug)
  const legacyCodex = join(p.codexConfigDir, 'skills', slug)
  if (await isRealDir(legacyCodex)) {
    add('warn', 'legacy-copy', `${legacyCodex} is a copy written by an older Agent Store; run: as migrate`)
  }

  if (!(await exists(dir))) {
    add('error', 'skill-content-missing', `${dir} is missing; neither tool can see the skill. Reinstall: as install ${slug} --force`)
    return
  }
  const marker = await readMarker(dir)
  if (!marker || marker.slug !== slug) {
    if (await isLegacyInstall(dir, slug)) add('warn', 'legacy-layout', `${dir} uses the old single-file layout; run: as migrate`)
    else add('error', 'skill-marker-missing', `${dir} has no Agent Store marker for ${slug}; it is treated as the user's and left alone`)
    return
  }
  if ((await contentHash(dir)) !== marker.contentHash) {
    add('warn', 'skill-modified', `${dir} changed since install; updates need --force and will overwrite the changes`)
  }

  const linked = await hasClaudeSkillLink(p.claudeConfigDir, slug, dir)
  if (entry.enabledFor.claude === true && !linked) {
    if (await exists(legacyClaude)) {
      add(
        (await isLegacyInstall(legacyClaude, slug)) ? 'warn' : 'error',
        'claude-shadowed',
        `${legacyClaude} is not Agent Store's symlink, so Claude reads it instead of ${dir}`,
      )
    } else {
      add('error', 'claude-link-missing', `${claudeSkillLink(p.claudeConfigDir, slug)} is missing; run: as sync --for claude`)
    }
  } else if (entry.enabledFor.claude !== true && linked) {
    add('warn', 'claude-link-stale', `skill is disabled for Claude but ${legacyClaude} still links to it; run: as disable ${slug} --for claude`)
  }

  const others = await sameNamedSkills(
    [skillStoreDir(p.aasHome), join(p.codexConfigDir, 'skills')],
    marker.runtimeNames.codex,
    dir,
  )
  for (const other of others) {
    add('warn', 'codex-shadowed', `Codex also finds a skill named "${marker.runtimeNames.codex}" at ${other}`)
  }
}

async function checkMcp(p: DoctorPaths, entry: InstalledItem, out: DoctorFinding[]): Promise<void> {
  const slug = entry.slug
  const add = (level: DoctorFinding['level'], code: string, message: string) => out.push({ level, code, slug, message })
  let targets
  try {
    targets = await readMcpTargets(itemDir(p.aasHome, 'mcp', slug))
  } catch (e) {
    add('error', 'targets-unreadable', (e as Error).message)
    return
  }
  for (const tool of ['claude', 'codex'] as ToolTarget[]) {
    const record = targets[tool]
    const enabled = entry.enabledFor[tool] === true
    if (!enabled) {
      if (record?.written) add('warn', 'mcp-stale-target', `disabled for ${tool} but targets.json still records an entry "${record.name}"`)
      continue
    }
    if (!record || record.written === null) {
      add('error', 'mcp-target-missing', `enabled for ${tool} but targets.json has no completed write; run: as enable ${slug} --for ${tool}`)
      continue
    }
    let actual: unknown
    try {
      actual = tool === 'claude'
        ? await readClaudeMcpEntry({ claudeConfigDir: p.claudeConfigDir, claudeJsonPath: p.claudeJsonPath }, record.name)
        : await readCodexMcpEntry({ codexHome: p.codexConfigDir }, record.name)
    } catch (e) {
      add('error', 'config-unreadable', `${tool}: ${(e as Error).message}`)
      continue
    }
    if (actual === undefined) {
      add('error', 'mcp-missing', `${tool} has no MCP server "${record.name}"; run: as sync --for ${tool}`)
      continue
    }
    const diff = mcpEntryDiff(tool, record.written, actual)
    if (diff.length) add('warn', 'mcp-changed-outside', `${tool} entry "${record.name}" differs from what Agent Store wrote: ${diff.join(', ')}`)
  }
}

/** Marker directories in the store that registry.json does not list. */
async function checkOrphans(p: DoctorPaths, slugs: Set<string>, out: DoctorFinding[]): Promise<void> {
  let entries: string[]
  try { entries = await readdir(skillStoreDir(p.aasHome)) } catch { return }
  for (const entry of entries.sort()) {
    if (slugs.has(entry)) continue
    const marker = await readMarker(join(skillStoreDir(p.aasHome), entry))
    if (marker?.slug === entry) {
      out.push({ level: 'warn', code: 'skill-orphan', slug: entry, message: `${join(skillStoreDir(p.aasHome), entry)} has an Agent Store marker but is not in registry.json; Codex still sees it` })
    }
  }
}

export async function runDoctor(p: DoctorPaths): Promise<DoctorFinding[]> {
  const registry = await readRegistry(p.aasHome)
  const out: DoctorFinding[] = []
  for (const entry of registry.installed) {
    if (entry.category === 'skill') await checkSkill(p, entry, out)
    else if (entry.category === 'mcp') await checkMcp(p, entry, out)
  }
  await checkOrphans(p, new Set(registry.installed.filter(e => e.category === 'skill').map(e => e.slug)), out)
  return out
}
