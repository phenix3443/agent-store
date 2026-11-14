// `as doctor`: compares what Agent Store recorded (registry.json, skill markers,
// MCP targets.json) with what each tool actually reads, without changing
// anything. See docs/global-skills-mcp.md §7 (PR7).
import { lstat, readdir, readFile, realpath } from 'fs/promises'
import { join } from 'path'
import { parse } from '@iarna/toml'
import type { InstalledItem, ToolTarget } from '@as/types'
import { readRegistry } from './registry'
import { itemDir, legacyAasHome } from './paths'
import { contentHash, isLegacyInstall, parseFrontmatter, readMarker, skillStoreDir } from './skills/store'
import { classifyTarget } from './skills/deploy'
import { readMcpTargets } from './config/mcp-targets'
import { readClaudeMcpEntry } from './config/claude-mcp'
import { readCodexMcpEntry } from './config/codex-mcp'
import { mcpEntryDiff } from './config/mcp-compare'
import { readProjects, toProject, type ProjectRecord } from './projects/store'
import { ProjectService } from './projects/service'
import { codexTrusted, CODEX_MCP_FILE, CLAUDE_MCP_FILE, mcpFileFor, readCodexProjectServers } from './projects/files'
import { detectAgents } from './agents'

export interface DoctorPaths {
  aasHome: string
  claudeConfigDir: string
  claudeJsonPath: string
  codexConfigDir: string
  /** ~/.agents, whose skills/ Codex also reads; defaults to the real one. */
  legacyHome?: string
}

export interface DoctorFinding {
  /** error: a tool does not see what the registry says; warn: works, but needs attention. */
  level: 'error' | 'warn'
  code: string
  slug?: string
  /** Id of the registered project the finding is about. */
  project?: string
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
        // Our own deployment of the same skill is not a clash.
        if ((await lstat(dir)).isSymbolicLink() && (await realpath(dir)) === (await realpath(own).catch(() => ''))) continue
        if (parseFrontmatter(await readFile(join(dir, 'SKILL.md'), 'utf-8'))?.name === name) found.push(dir)
      } catch { /* not a skill */ }
    }
  }
  return found
}

const TOOL = { claude: 'Claude Code', codex: 'Codex' } as const

async function checkSkill(p: DoctorPaths, entry: InstalledItem, out: DoctorFinding[]): Promise<void> {
  const slug = entry.slug
  const dir = itemDir(p.aasHome, 'skill', slug)
  const add = (level: DoctorFinding['level'], code: string, message: string) => out.push({ level, code, slug, message })

  if (!(await exists(dir))) {
    add('error', 'skill-content-missing', `${dir} is missing; no tool can see the skill. Reinstall: aas install ${slug} --force`)
    return
  }
  const marker = await readMarker(dir)
  if (!marker || marker.slug !== slug) {
    if (await isLegacyInstall(dir, slug)) add('warn', 'legacy-layout', `${dir} uses the old single-file layout; run: aas migrate`)
    else add('error', 'skill-marker-missing', `${dir} has no Agent Store marker for ${slug}; it is treated as the user's and left alone`)
    const legacyCodex = join(p.codexConfigDir, 'skills', slug)
    if (await isRealDir(legacyCodex)) add('warn', 'legacy-copy', `${legacyCodex} is a copy written by an older Agent Store; run: aas migrate`)
    return
  }
  if ((await contentHash(dir)) !== marker.contentHash) {
    add('warn', 'skill-modified', `${dir} changed since install; updates need --force and will overwrite the changes`)
  }

  for (const tool of ['claude', 'codex'] as ToolTarget[]) {
    const record = entry.deployments?.[tool]
    const root = join(tool === 'claude' ? p.claudeConfigDir : p.codexConfigDir, 'skills')
    const path = record?.path ?? join(root, marker.runtimeNames.claude)
    const state = await classifyTarget(path, dir)
    const deployed = record?.mode === 'copy' ? state === 'real-dir' : state === 'link-to-source'
    if (entry.enabledFor[tool] === true) {
      if (!deployed) {
        if (state === 'absent') add('error', `${tool}-link-missing`, `${path} is missing; run: aas sync --for ${tool}`)
        else add('error', `${tool}-shadowed`, `${path} is not Agent Store's deployment, so ${TOOL[tool]} reads it instead of ${dir}`)
      } else if (!record) {
        add('warn', `${tool}-unrecorded`, `${path} links to the skill but Agent Store has no record of it; run: aas migrate`)
      } else if (record.mode === 'copy' && record.sourceHash !== marker.contentHash) {
        add('warn', `${tool}-copy-stale`, `${path} is a copy of an older version of the skill; run: aas sync --for ${tool}`)
      }
    } else if (deployed) {
      add('warn', `${tool}-link-stale`, `skill is disabled for ${TOOL[tool]} but ${path} still deploys it; run: aas disable ${slug} --for ${tool}`)
    }
  }

  // Codex finds skills by frontmatter name in its own root and in the shared ~/.agents/skills.
  const codexPath = entry.deployments?.codex?.path ?? join(p.codexConfigDir, 'skills', marker.runtimeNames.claude)
  const others = await sameNamedSkills([join(p.codexConfigDir, 'skills'), join(p.legacyHome ?? legacyAasHome(), 'skills')], marker.runtimeNames.codex, codexPath)
  for (const other of others) {
    add('warn', 'codex-shadowed', `Codex also finds a skill named "${marker.runtimeNames.codex}" at ${other}`)
  }
}

function serverNames(container: unknown): string[] {
  const servers = (container as { mcpServers?: unknown; mcp_servers?: unknown } | null)
  const table = servers?.mcpServers ?? servers?.mcp_servers
  return table && typeof table === 'object' ? Object.keys(table) : []
}

/** Places that override the user-scope entry `name` (§5.5); phase one only warns about them. */
async function mcpShadows(p: DoctorPaths, tool: ToolTarget, name: string): Promise<string[]> {
  const found: string[] = []
  const registered = await registeredProjects(p)
  if (tool === 'claude') {
    let json: { projects?: Record<string, unknown> } = {}
    try { json = JSON.parse(await readFile(p.claudeJsonPath, 'utf-8')) } catch { /* no user file */ }
    const dirs = new Set([...Object.keys(json.projects ?? {}), ...registered.map(r => r.path)])
    for (const dir of dirs) {
      if (serverNames(json.projects?.[dir]).includes(name)) found.push(`local scope in ${dir}`)
      try {
        const mcpJson = join(dir, CLAUDE_MCP_FILE)
        if (serverNames(JSON.parse(await readFile(mcpJson, 'utf-8'))).includes(name)) found.push(`project scope in ${mcpJson}`)
      } catch { /* no project file */ }
    }
  } else {
    let config: { profiles?: Record<string, unknown> } = {}
    try { config = parse(await readFile(join(p.codexConfigDir, 'config.toml'), 'utf-8')) as typeof config } catch { /* no user file */ }
    for (const [profile, table] of Object.entries(config.profiles ?? {})) {
      if (serverNames(table).includes(name)) found.push(`profile "${profile}"`)
    }
    // Codex merges a trusted project's table into the user one key by key.
    for (const r of registered) {
      if (!(await codexTrusted(fullPaths(p), r.path))) continue
      const servers = await readCodexProjectServers(r.path).catch(() => ({}))
      if (name in servers) found.push(`project scope in ${join(r.path, CODEX_MCP_FILE)} (merged over the user entry)`)
    }
  }
  return found
}

function fullPaths(p: DoctorPaths) {
  return { aasHome: p.aasHome, claudeConfigDir: p.claudeConfigDir, claudeJsonPath: p.claudeJsonPath, codexConfigDir: p.codexConfigDir }
}

async function registeredProjects(p: DoctorPaths): Promise<ProjectRecord[]> {
  try { return (await readProjects(p.aasHome)).projects } catch { return [] }
}

/** What `aas projects show` reports, turned into findings: one source for both. */
async function checkProjects(p: DoctorPaths, out: DoctorFinding[]): Promise<void> {
  let records: ProjectRecord[]
  try {
    records = (await readProjects(p.aasHome)).projects
  } catch (e) {
    out.push({ level: 'error', code: 'projects-unreadable', message: (e as Error).message })
    return
  }
  const service = new ProjectService(fullPaths(p))
  for (const record of records) {
    const add = (level: DoctorFinding['level'], code: string, message: string, slug?: string) =>
      out.push({ level, code, project: record.id, ...(slug ? { slug } : {}), message })
    if (!(await toProject(record)).exists) {
      add('warn', 'project-missing', `project ${record.name} (${record.path}) no longer exists; run: aas projects move ${record.id} <new path>, or aas projects remove ${record.id}`)
      continue
    }
    const detail = await service.detail(record.id)
    for (const item of record.items) {
      const shown = item.kind === 'skill'
        ? detail.skills.find(s => s.slug === item.slug)?.locations ?? []
        : detail.mcps.find(m => m.slug === item.slug)?.locations ?? []
      for (const agent of Object.keys(item.targets) as ToolTarget[]) {
        const loc = shown.find(l => l.agent === agent && l.managed)
        const where = item.kind === 'skill' ? item.targets[agent]!.path : mcpFileFor(agent)
        if (!loc) add('warn', 'project-item-missing', `${item.slug} is no longer in ${join(record.path, where)}; reinstall: aas install ${item.slug} --project ${record.id} --target ${agent}`, item.slug)
        else if (loc.modified) add('warn', 'project-item-modified', `${item.slug} in ${join(record.path, where)} was edited since Agent Store installed it; reinstalling or uninstalling it needs --force`, item.slug)
      }
    }
    for (const mcp of detail.mcps) {
      if (mcp.missingEnv.length) {
        add('warn', 'project-env-missing', `MCP server "${mcp.name}" in ${record.path} reads ${mcp.missingEnv.join(', ')}, which have no value on this machine; set them with: aas projects set-env ${record.id} <NAME>`, mcp.slug)
      }
      if (!detail.codexTrusted && mcp.managed && mcp.locations.some(l => l.agent === 'codex' && l.managed)) {
        add('warn', 'project-codex-untrusted', `Codex ignores ${join(record.path, CODEX_MCP_FILE)} until the project is trusted (trust it once in Codex, or add [projects."${record.path}"] trust_level = "trusted" to ${join(p.codexConfigDir, 'config.toml')})`, mcp.slug)
      }
    }
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
      add('error', 'mcp-target-missing', `enabled for ${tool} but targets.json has no completed write; run: aas enable ${slug} --for ${tool}`)
      continue
    }
    for (const where of await mcpShadows(p, tool, record.name)) {
      add('warn', 'mcp-shadowed', `${tool} uses another MCP server "${record.name}" from the ${where} instead of the user entry`)
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
      add('error', 'mcp-missing', `${tool} has no MCP server "${record.name}"; run: aas sync --for ${tool}`)
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
      out.push({ level: 'warn', code: 'skill-orphan', slug: entry, message: `${join(skillStoreDir(p.aasHome), entry)} has an Agent Store marker but is not in registry.json; no tool sees it, remove it or reinstall` })
    }
  }
}

/** Agents something is enabled for that are not on this machine, or whose CLI the MCP writes would use is missing. */
async function checkAgents(p: DoctorPaths, installed: InstalledItem[], env: NodeJS.ProcessEnv, out: DoctorFinding[]): Promise<void> {
  for (const a of await detectAgents(p, env)) {
    const enabled = installed.filter(e => e.enabledFor[a.agent] === true)
    if (!enabled.length) continue
    if (!a.detected) {
      out.push({ level: 'warn', code: 'agent-not-found', message: `${TOOL[a.agent]} was not found (no ${a.agent} on PATH, no ${a.configDir}), but ${enabled.length} item(s) are enabled for it; they take effect once it is installed` })
    } else if (!a.binary && enabled.some(e => e.category === 'mcp')) {
      out.push({ level: 'warn', code: 'agent-cli-missing', message: `${TOOL[a.agent]}'s CLI (${a.agent}) is not on PATH: MCP entries are written by editing ${a.mcpConfigPath} directly, and taking over a same-name entry (--replace) is unavailable` })
    }
  }
}

export interface DoctorOptions {
  /** Also report agents that are missing (`aas doctor` and the desktop check do). */
  agents?: boolean
  env?: NodeJS.ProcessEnv
}

export async function runDoctor(p: DoctorPaths, options: DoctorOptions = {}): Promise<DoctorFinding[]> {
  const registry = await readRegistry(p.aasHome)
  const out: DoctorFinding[] = []
  if (options.agents) await checkAgents(p, registry.installed, options.env ?? process.env, out)
  for (const entry of registry.installed) {
    if (entry.category === 'skill') await checkSkill(p, entry, out)
    else if (entry.category === 'mcp') await checkMcp(p, entry, out)
  }
  await checkOrphans(p, new Set(registry.installed.filter(e => e.category === 'skill').map(e => e.slug)), out)
  await checkProjects(p, out)
  return out
}
