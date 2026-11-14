// Project-level skills and MCP servers (issue #166). Everything is written into the
// project's own files, which are committed: skills are copied, never linked to
// ~/.agent-store, and MCP entries reference variables instead of holding values.
// What Agent Store wrote is recorded in projects.json; anything else in those
// files is the project's own and is only read.
import { cp, mkdir, mkdtemp, rename, rm } from 'fs/promises'
import { join, relative } from 'path'
import type {
  AddProjectOptions, MCPItem, Paths, Project, ProjectDetail, ProjectEnvVar, ProjectInstallOptions, ProjectSummary,
  ProjectInstallResult, ProjectMcp, ProjectMcpLocation, ProjectSkill, ProjectUninstallOptions,
  ProjectUninstallResult, SkillItem, ToolTarget,
} from '@as/types'
import type { Catalog } from '../catalog'
import { assertSafeSlug } from '../paths'
import { findEntry, readRegistry } from '../registry/index'
import { contentHash, deployDirName, fetchSkillInto, MARKER } from '../skills/store'
import { classifyTarget } from '../skills/deploy'
import { mcpEntriesEqual } from '../config/mcp-compare'
import {
  claudeApprovals, claudeLocalServers, claudeUserServers, CLAUDE_MCP_FILE, codexSkillRoots, codexTrusted,
  codexUserServers, CODEX_MCP_FILE, mcpFileFor, readCodexProjectServers, readMcpJsonServers, scanSkills,
  skillsDirFor, writeCodexProjectServer, writeMcpJsonServer, type FoundSkill,
} from './files'
import {
  claudeEnvRefs, claudeProjectEntry, codexEnvRefs, codexProjectEntry, ProjectMcpUnsupportedError, projectMcpSpec,
  type EnvRef,
} from './mcp-entries'
import {
  addProjectRecord, findProject, readProjectEnv, readProjects, relocateProjectRecord, removeProjectRecord,
  setProjectEnvValue, toProject, updateProjects, type McpRecord, type ProjectRecord, type SkillRecord,
} from './store'

const AGENTS: ToolTarget[] = ['claude', 'codex']

/** Something already sits where the item would go and Agent Store did not put it there (or it was edited since). */
export class ProjectConflictError extends Error {
  constructor(message: string, readonly reason: 'not-ours' | 'modified' | 'name-clash', readonly tool: ToolTarget) {
    super(message)
    this.name = 'ProjectConflictError'
  }
}

export class ProjectItemNotInstalledError extends Error {
  readonly reason = 'not-installed'
  constructor(slug: string, project: string) {
    super(`${slug} was not installed into ${project} by Agent Store; only what Agent Store installed can be uninstalled`)
    this.name = 'ProjectItemNotInstalledError'
  }
}

function missingDir(record: ProjectRecord): Error {
  return Object.assign(new Error(`${record.path} no longer exists; move the project with: aas projects move ${record.id} <new path>`), { reason: 'project-missing' })
}

async function requireDir(record: ProjectRecord): Promise<void> {
  if (!(await toProject(record)).exists) throw missingDir(record)
}

export class ProjectService {
  /** Without a catalog the service only reads (doctor). */
  constructor(private readonly paths: Required<Paths>, private readonly catalog?: Catalog) {}

  private get home(): string {
    return this.paths.aasHome
  }

  async list(): Promise<Project[]> {
    return Promise.all((await readProjects(this.home)).projects.map(toProject))
  }

  async summaries(): Promise<ProjectSummary[]> {
    return Promise.all((await readProjects(this.home)).projects.map(async (record) => {
      const project = await toProject(record)
      const installed = record.items.map(i => ({ kind: i.kind, slug: i.slug, name: i.name, ...(i.resourceId ? { resourceId: i.resourceId } : {}) }))
      let skills: number | null = null
      let mcps: number | null = null
      if (project.exists) {
        try {
          const detail = await this.detail(record.id)
          skills = detail.skills.length
          mcps = detail.mcps.length
        } catch { /* one unreadable project leaves the others' counts */ }
      }
      return { ...project, skills, mcps, installed }
    }))
  }

  add(path: string, options: AddProjectOptions = {}): Promise<Project> {
    return addProjectRecord(this.home, path, options.name)
  }

  remove(ref: string): Promise<void> {
    return removeProjectRecord(this.home, ref)
  }

  relocate(ref: string, newPath: string): Promise<Project> {
    return relocateProjectRecord(this.home, ref, newPath)
  }

  private async record(ref: string): Promise<ProjectRecord> {
    return findProject(await readProjects(this.home), ref)
  }

  async setEnv(ref: string, name: string, value: string): Promise<void> {
    await setProjectEnvValue(this.home, (await this.record(ref)).id, name, value)
  }

  async unsetEnv(ref: string, name: string): Promise<void> {
    await setProjectEnvValue(this.home, (await this.record(ref)).id, name, undefined)
  }

  async envValues(ref: string): Promise<Record<string, string>> {
    return readProjectEnv(this.home, (await this.record(ref)).id)
  }

  // ── What the agents use ────────────────────────────────────────────────────

  async detail(ref: string): Promise<ProjectDetail> {
    const record = await this.record(ref)
    const project = await toProject(record)
    const trusted = project.exists ? await codexTrusted(this.paths, record.path) : false
    if (!project.exists) return { ...project, codexTrusted: false, skills: [], mcps: [], env: [] }
    const stored = await readProjectEnv(this.home, record.id)
    const skills = await this.skills(record)
    const mcps = await this.mcps(record, trusted, stored)
    const env = new Map<string, ProjectEnvVar>()
    for (const mcp of mcps) {
      for (const loc of mcp.locations) {
        for (const name of loc.env) {
          const v = env.get(name) ?? { name, stored: name in stored, usedBy: [] }
          if (!v.usedBy.includes(mcp.name)) v.usedBy.push(mcp.name)
          env.set(name, v)
        }
      }
    }
    for (const name of Object.keys(stored)) if (!env.has(name)) env.set(name, { name, stored: true, usedBy: [] })
    return { ...project, codexTrusted: trusted, skills, mcps, env: [...env.values()] }
  }

  private async skills(record: ProjectRecord): Promise<ProjectSkill[]> {
    const found: FoundSkill[] = [
      ...await scanSkills(join(record.path, skillsDirFor('claude')), 'claude'),
      ...(await Promise.all((await codexSkillRoots(record.path)).map(root => scanSkills(root, 'codex')))).flat(),
    ]
    const managed = record.items.filter((i): i is SkillRecord => i.kind === 'skill')
    const out: ProjectSkill[] = []
    for (const skill of found) {
      const owner = managed.find(m => m.targets[skill.agent] && join(record.path, m.targets[skill.agent]!.path) === skill.path)
      const modified = owner ? (await contentHash(skill.path).catch(() => '')) !== owner.targets[skill.agent]!.hash : false
      const key = owner ? `slug:${owner.slug}` : `name:${skill.name}`
      let group = out.find(g => (g.slug ? `slug:${g.slug}` : `name:${g.name}`) === key)
      if (!group) {
        group = {
          kind: 'skill', name: owner?.name ?? skill.name, managed: !!owner, agents: [], locations: [],
          ...(skill.description ? { description: skill.description } : {}),
          ...(owner ? { slug: owner.slug, version: owner.version } : {}),
        }
        out.push(group)
      }
      group.locations.push({ agent: skill.agent, path: skill.path, managed: !!owner, modified })
      if (!group.agents.includes(skill.agent)) group.agents.push(skill.agent)
    }
    return out
  }

  private async mcps(record: ProjectRecord, trusted: boolean, stored: Record<string, string>): Promise<ProjectMcp[]> {
    const [shared, local, claudeUser, codexShared, codexUser, approval] = await Promise.all([
      readMcpJsonServers(record.path).catch(() => ({})),
      claudeLocalServers(this.paths, record.path),
      claudeUserServers(this.paths),
      readCodexProjectServers(record.path).catch(() => ({})),
      codexUserServers(this.paths),
      claudeApprovals(this.paths, record.path),
    ])
    const managed = record.items.filter((i): i is McpRecord => i.kind === 'mcp')
    const out: ProjectMcp[] = []
    const add = (name: string, loc: ProjectMcpLocation, owner?: McpRecord) => {
      let group = out.find(g => g.name === name)
      if (!group) {
        group = { kind: 'mcp', name, managed: false, agents: [], overridesUser: false, missingEnv: [], locations: [] }
        out.push(group)
      }
      group.locations.push(loc)
      if (owner) Object.assign(group, { managed: true, slug: owner.slug, version: owner.version })
      if (loc.active && !group.agents.includes(loc.agent)) group.agents.push(loc.agent)
      group.overridesUser ||= loc.overridesUser && loc.active
      for (const v of loc.missingEnv) if (!group.missingEnv.includes(v)) group.missingEnv.push(v)
    }
    const envOf = (refs: EnvRef[]) => ({
      env: refs.map(r => r.name),
      missingEnv: refs.filter(r => r.required && !(r.name in stored)).map(r => r.name),
    })
    for (const [name, entry] of Object.entries(local)) {
      add(name, {
        agent: 'claude', scope: 'local', file: this.paths.claudeJsonPath, managed: false, modified: false, active: true,
        overridesUser: name in claudeUser, ...envOf(claudeEnvRefs(entry)),
      })
    }
    for (const [name, entry] of Object.entries(shared)) {
      const owner = managed.find(m => m.name === name && m.targets.claude)
      const state = approval(name)
      const shadowed = name in local
      add(name, {
        agent: 'claude', scope: 'project', file: join(record.path, CLAUDE_MCP_FILE), managed: !!owner,
        modified: !!owner && !mcpEntriesEqual('claude', entry, owner.targets.claude!.written),
        active: state === 'approved' && !shadowed, approval: state, ...(shadowed ? { shadowedBy: 'local' as const } : {}),
        overridesUser: name in claudeUser, ...envOf(claudeEnvRefs(entry)),
      }, owner)
    }
    for (const [name, entry] of Object.entries(codexShared)) {
      const owner = managed.find(m => m.name === name && m.targets.codex)
      add(name, {
        agent: 'codex', scope: 'project', file: join(record.path, CODEX_MCP_FILE), managed: !!owner,
        modified: !!owner && !mcpEntriesEqual('codex', entry, owner.targets.codex!.written),
        active: trusted, overridesUser: name in codexUser, ...envOf(codexEnvRefs(entry)),
      }, owner)
    }
    return out
  }

  // ── Install ────────────────────────────────────────────────────────────────

  async install(ref: string, itemRef: string, options: ProjectInstallOptions = {}): Promise<ProjectInstallResult> {
    const project = await this.record(ref)
    await requireDir(project)
    if (!itemRef.includes(':')) assertSafeSlug(itemRef)
    // An item installed for the user is reinstalled from the same catalog entry.
    const user = itemRef.includes(':') ? undefined : findEntry(await readRegistry(this.home), itemRef)
    if (!this.catalog) throw new Error('Installing into a project needs the catalog')
    const source = await this.catalog.resolveItem(user?.resourceId ?? itemRef, user ? { kind: user.category } : {})
    const item = source.item
    if (item.category !== 'skill' && item.category !== 'mcp') {
      throw Object.assign(new Error(`${item.slug} is a ${item.category}; only skills and MCP servers can be installed into a project`), { reason: 'unsupported' })
    }
    const requested = options.targets?.length ? [...new Set(options.targets)] : item.compatibleWith
    for (const t of requested) {
      if (!item.compatibleWith.includes(t)) throw Object.assign(new Error(`${item.slug} does not support ${t}; nothing was installed`), { reason: 'incompatible', target: t })
    }
    const meta = { slug: item.slug, version: item.version, ...(source.resourceId ? { resourceId: source.resourceId } : {}) }
    return item.category === 'skill'
      ? this.installSkill(project.id, item as SkillItem, meta, requested, options)
      : this.installMcp(project.id, item as MCPItem, meta, requested, options)
  }

  private async installSkill(
    projectId: string, item: SkillItem, meta: { slug: string; version: string; resourceId?: string },
    agents: ToolTarget[], options: ProjectInstallOptions,
  ): Promise<ProjectInstallResult> {
    await mkdir(this.home, { recursive: true })
    const stage = await mkdtemp(join(this.home, '.as-project-stage-'))
    try {
      const { frontmatter } = await fetchSkillInto(item, stage)
      const name = deployDirName(item.slug, frontmatter.name)
      const hash = await contentHash(stage)
      return await updateProjects(this.home, async file => {
        const project = await findProject(file, projectId)
        await requireDir(project)
        const prev = project.items.find((i): i is SkillRecord => i.kind === 'skill' && i.slug === item.slug)
        const plan = []
        for (const agent of agents) {
          const rel = prev?.targets[agent]?.path ?? join(skillsDirFor(agent), name)
          const path = join(project.path, rel)
          await this.checkSkillTarget(project, path, prev?.targets[agent]?.hash, agent, options.force)
          if (agent === 'codex') await this.checkCodexSkillName(project, frontmatter.name, path)
          plan.push({ agent, rel, path })
        }
        const now = new Date().toISOString()
        const record: SkillRecord = prev ?? { kind: 'skill', ...meta, name, installedAt: now, updatedAt: now, targets: {} }
        Object.assign(record, meta, { updatedAt: now })
        if (!prev) project.items.push(record)
        const installed: ProjectInstallResult['installed'] = []
        for (const step of plan) {
          await copySkill(stage, step.path)
          record.targets[step.agent] = { path: step.rel, hash }
          installed.push({ agent: step.agent, file: step.path })
        }
        return {
          projectId: project.id, ...meta, kind: 'skill' as const, name, installed, skipped: [], env: [],
          codexTrusted: await codexTrusted(this.paths, project.path),
        }
      })
    } finally {
      await rm(stage, { recursive: true, force: true })
    }
  }

  private async checkSkillTarget(project: ProjectRecord, path: string, hash: string | undefined, agent: ToolTarget, force?: boolean): Promise<void> {
    const state = await classifyTarget(path)
    if (state === 'absent') return
    const rel = relative(project.path, path)
    if (!hash || state !== 'real-dir') {
      throw new ProjectConflictError(`${rel} already exists in ${project.path} and was not installed by Agent Store; it was left untouched`, 'not-ours', agent)
    }
    if (!force && (await contentHash(path)) !== hash) {
      throw new ProjectConflictError(`${rel} was edited since Agent Store installed it; pass --force to replace it`, 'modified', agent)
    }
  }

  /** Codex picks skills by frontmatter name, so another one with ours in any `.agents/skills` it reads would clash. */
  private async checkCodexSkillName(project: ProjectRecord, name: string, own: string): Promise<void> {
    for (const root of await codexSkillRoots(project.path)) {
      for (const s of await scanSkills(root, 'codex')) {
        if (s.name === name && s.path !== own) {
          throw new ProjectConflictError(`Codex already sees a skill named "${name}" at ${s.path} in this project; nothing was installed`, 'name-clash', 'codex')
        }
      }
    }
  }

  private async installMcp(
    projectId: string, item: MCPItem, meta: { slug: string; version: string; resourceId?: string },
    agents: ToolTarget[], options: ProjectInstallOptions,
  ): Promise<ProjectInstallResult> {
    const { spec, env } = projectMcpSpec(item)
    const name = item.slug
    const entries: Partial<Record<ToolTarget, Record<string, unknown>>> = {}
    const skipped: ProjectInstallResult['skipped'] = []
    for (const agent of agents) {
      try {
        entries[agent] = agent === 'claude' ? claudeProjectEntry(spec) : codexProjectEntry(item.slug, spec)
      } catch (e) {
        // Only refuse outright when this was the one agent asked for.
        if (!(e instanceof ProjectMcpUnsupportedError) || options.targets?.length === 1) throw e
        skipped.push({ agent, reason: e.reason, message: e.message })
      }
    }
    const targets = AGENTS.filter(a => entries[a])
    if (!targets.length) throw new Error(`${item.slug} could not be installed for ${agents.join(' or ')}: ${skipped.map(s => s.message).join('; ')}`)
    return updateProjects(this.home, async file => {
      const project = await findProject(file, projectId)
      await requireDir(project)
      const prev = project.items.find((i): i is McpRecord => i.kind === 'mcp' && i.slug === item.slug)
      const current: Partial<Record<ToolTarget, unknown>> = {
        claude: targets.includes('claude') ? (await readMcpJsonServers(project.path))[name] : undefined,
        codex: targets.includes('codex') ? (await readCodexProjectServers(project.path))[name] : undefined,
      }
      for (const agent of targets) {
        const now = current[agent]
        if (now === undefined) continue
        const written = prev?.targets[agent]?.written
        if (written === undefined) {
          throw new ProjectConflictError(`${mcpFileFor(agent)} in ${project.path} already has an MCP server "${name}" that Agent Store did not write; it was left untouched`, 'not-ours', agent)
        }
        if (!options.force && !mcpEntriesEqual(agent, now, written)) {
          throw new ProjectConflictError(`The "${name}" entry in ${mcpFileFor(agent)} was edited since Agent Store wrote it; pass --force to replace it`, 'modified', agent)
        }
      }
      const time = new Date().toISOString()
      const record: McpRecord = prev ?? { kind: 'mcp', ...meta, name, installedAt: time, updatedAt: time, targets: {}, env }
      Object.assign(record, meta, { updatedAt: time, env })
      if (!prev) project.items.push(record)
      const installed: ProjectInstallResult['installed'] = []
      for (const agent of targets) {
        const entry = entries[agent]!
        if (agent === 'claude') await writeMcpJsonServer(this.home, project.path, name, entry)
        else await writeCodexProjectServer(this.home, project.path, name, entry)
        record.targets[agent] = { written: entry }
        installed.push({ agent, file: join(project.path, mcpFileFor(agent)) })
      }
      return {
        projectId: project.id, ...meta, kind: 'mcp' as const, name, installed, skipped, env,
        codexTrusted: await codexTrusted(this.paths, project.path),
      }
    })
  }

  // ── Uninstall ──────────────────────────────────────────────────────────────

  async uninstall(ref: string, slug: string, options: ProjectUninstallOptions = {}): Promise<ProjectUninstallResult> {
    const { id } = await this.record(ref)
    return updateProjects(this.home, async file => {
      const project = await findProject(file, id)
      const item = project.items.find(i => i.slug === slug)
      if (!item) throw new ProjectItemNotInstalledError(slug, project.path)
      const agents = (options.targets?.length ? options.targets : AGENTS).filter(a => item.targets[a])
      if (!agents.length) throw new ProjectItemNotInstalledError(`${slug} (${options.targets!.join(', ')})`, project.path)
      const removed: ProjectUninstallResult['removed'] = []
      // Every target is checked before any is removed, so a refusal changes nothing.
      const steps = item.kind === 'skill'
        ? await this.planSkillRemoval(project, item, agents, options.force)
        : await this.planMcpRemoval(project, item, agents, options.force)
      for (const step of steps) {
        await step.run()
        delete (item.targets as Record<string, unknown>)[step.agent]
        removed.push({ agent: step.agent, file: step.file })
      }
      if (!Object.keys(item.targets).length) project.items = project.items.filter(i => i !== item)
      return { removed }
    })
  }

  private async planSkillRemoval(project: ProjectRecord, item: SkillRecord, agents: ToolTarget[], force?: boolean) {
    const steps = []
    for (const agent of agents) {
      const target = item.targets[agent]!
      const path = join(project.path, target.path)
      const state = await classifyTarget(path)
      if (state !== 'absent') {
        if (state !== 'real-dir') throw new ProjectConflictError(`${target.path} is no longer the copy Agent Store installed; it was left untouched`, 'not-ours', agent)
        if (!force && (await contentHash(path)) !== target.hash) {
          throw new ProjectConflictError(`${target.path} was edited since Agent Store installed it; pass --force to remove it anyway`, 'modified', agent)
        }
      }
      steps.push({ agent, file: path, run: () => state === 'absent' ? Promise.resolve() : rm(path, { recursive: true }) })
    }
    return steps
  }

  private async planMcpRemoval(project: ProjectRecord, item: McpRecord, agents: ToolTarget[], force?: boolean) {
    const steps = []
    for (const agent of agents) {
      const servers = agent === 'claude' ? await readMcpJsonServers(project.path) : await readCodexProjectServers(project.path)
      const now = servers[item.name]
      const file = join(project.path, mcpFileFor(agent))
      if (now !== undefined && !force && !mcpEntriesEqual(agent, now, item.targets[agent]!.written)) {
        throw new ProjectConflictError(`The "${item.name}" entry in ${mcpFileFor(agent)} was edited since Agent Store wrote it; pass --force to remove it anyway`, 'modified', agent)
      }
      steps.push({
        agent, file,
        run: async () => {
          if (now === undefined) return
          if (agent === 'claude') await writeMcpJsonServer(this.home, project.path, item.name, undefined)
          else await writeCodexProjectServer(this.home, project.path, item.name, undefined)
        },
      })
    }
    return steps
  }
}

/** Copies the staged skill to `target` through a sibling directory, so a failed copy leaves the old one in place. */
async function copySkill(stage: string, target: string): Promise<void> {
  const parent = join(target, '..')
  await mkdir(parent, { recursive: true })
  const tmp = await mkdtemp(join(parent, '.as-copy-'))
  const next = join(tmp, 'skill')
  try {
    await cp(stage, next, { recursive: true, verbatimSymlinks: true, filter: from => relative(stage, from) !== MARKER })
    const old = join(tmp, 'old')
    let moved = false
    try { await rename(target, old); moved = true } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
    try {
      await rename(next, target)
    } catch (e) {
      if (moved) await rename(old, target)
      throw e
    }
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

