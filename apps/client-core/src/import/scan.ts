// The user's own skills and user-level MCP entries, i.e. what each agent reads that
// Agent Store did not put there. Read-only: nothing here writes, and an MCP entry is
// only described through summarizeMcpEntry, which leaves its secrets out.
import { createHash } from 'crypto'
import { lstat, readdir, readFile, readlink, realpath } from 'fs/promises'
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'path'
import type {
  CatalogMatch, ImportScan, McpCandidate, McpResourceDetail, Paths, SkillCandidate, SkillLocation, SkillNotImportable,
  SkillResourceDetail, SkillRoot, ToolTarget,
} from '@as/types'
import type { Catalog } from '../catalog'
import { readRegistry } from '../registry/index'
import { contentHash, MARKER, parseFrontmatter, skillStoreDir } from '../skills/store'
import { readMcpTargets } from '../config/mcp-targets'
import { readJsonObject } from '../config/safe-file'
import { readCodexMcpServers } from '../config/codex-mcp'
import { itemDir } from '../paths'
import { detectAgents } from '../agents'
import { summarizeMcpEntry } from './redact'

export interface ImportPaths extends Required<Paths> {
  /** ~/.agents/skills, which Codex reads too. */
  agentsSkillsDir: string
}

const MAX_FILES = 2000

const ROOT_AGENT: Record<SkillRoot, ToolTarget> = { claude: 'claude', codex: 'codex', agents: 'codex' }

export function skillRoots(p: ImportPaths): Array<{ root: SkillRoot; dir: string }> {
  return [
    { root: 'claude', dir: join(p.claudeConfigDir, 'skills') },
    { root: 'codex', dir: join(p.codexConfigDir, 'skills') },
    { root: 'agents', dir: p.agentsSkillsDir },
  ]
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function inside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep)
}

/** One skill directory as found, before grouping. */
export interface FoundSkill extends SkillLocation {
  dirName: string
  name: string | null
  description: string | null
  hash: string | null
  /** Git blob sha per relative path, to compare with the catalog's file list. */
  blobs: Map<string, string>
  files: number
  reason?: SkillNotImportable
}

const blobSha = (data: Buffer) => createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex')

/** Walks a real skill directory: file count, git blob shas, and whether any link inside escapes it. */
async function inspect(dir: string): Promise<{ files: number; blobs: Map<string, string>; reason?: SkillNotImportable }> {
  const blobs = new Map<string, string>()
  let files = 0
  let reason: SkillNotImportable | undefined
  const walk = async (rel: string): Promise<void> => {
    for (const name of (await readdir(join(dir, rel))).sort()) {
      if (reason === 'too-large') return
      const r = rel ? `${rel}/${name}` : name
      if (r === MARKER) { reason ??= 'has-marker'; continue }
      const full = join(dir, r)
      const st = await lstat(full)
      if (st.isDirectory()) { await walk(r); continue }
      if (++files > MAX_FILES) { reason = 'too-large'; return }
      if (st.isSymbolicLink()) {
        const target = await readlink(full)
        const resolved = normalize(join(dirname(r), target))
        if (isAbsolute(target) || resolved === '..' || resolved.startsWith(`..${sep}`)) reason ??= 'external-link'
        blobs.set(r, blobSha(Buffer.from(target)))
      } else {
        blobs.set(r, blobSha(await readFile(full)))
      }
    }
  }
  await walk('')
  return { files, blobs, ...(reason ? { reason } : {}) }
}

async function managedSkillPaths(p: ImportPaths): Promise<Set<string>> {
  const out = new Set<string>()
  for (const e of (await readRegistry(p.aasHome)).installed) {
    for (const d of Object.values(e.deployments ?? {})) if (d) out.add(resolve(d.path))
  }
  return out
}

export async function findSkills(p: ImportPaths): Promise<FoundSkill[]> {
  const managed = await managedSkillPaths(p)
  let library = skillStoreDir(p.aasHome)
  library = await realpath(library).catch(() => library)
  const found: FoundSkill[] = []
  for (const { root, dir } of skillRoots(p)) {
    let entries: string[]
    try { entries = (await readdir(dir)).sort() } catch { continue }
    for (const dirName of entries) {
      if (dirName.startsWith('.')) continue
      const path = join(dir, dirName)
      if (managed.has(resolve(path))) continue
      let st
      try { st = await lstat(path) } catch { continue }
      let linkTarget: string | undefined
      if (st.isSymbolicLink()) {
        linkTarget = await readlink(path).catch(() => undefined)
        const real = await realpath(path).catch(() => undefined)
        if (!real || inside(real, library)) continue
      } else if (!st.isDirectory()) continue
      let names: string[]
      try { names = await readdir(path) } catch { continue }
      // Exact case: a case-insensitive disk would also open skill.md, which no agent reads.
      if (!names.includes('SKILL.md')) continue
      let text = ''
      try { text = await readFile(join(path, 'SKILL.md'), 'utf-8') } catch { /* unreadable below */ }
      const fm = parseFrontmatter(text)
      const base = {
        agent: ROOT_AGENT[root], root, path, dirName, name: fm?.name ?? null, description: fm?.description ?? null,
        ...(linkTarget !== undefined ? { linkTarget } : {}),
      }
      if (linkTarget !== undefined) {
        found.push({ ...base, hash: null, blobs: new Map(), files: 0, reason: 'symlink' })
        continue
      }
      try {
        const info = await inspect(path)
        found.push({ ...base, hash: info.reason ? null : await contentHash(path), blobs: info.blobs, files: info.files, ...(info.reason ? { reason: info.reason } : {}) })
      } catch {
        found.push({ ...base, hash: null, blobs: new Map(), files: 0, reason: 'unreadable' })
      }
    }
  }
  return found
}

/**
 * One candidate per directory name when every place holds the same content and no agent has it
 * twice (import once, deploy to each place); otherwise one per place.
 */
export function groupSkills(found: FoundSkill[]): Array<{ candidate: SkillCandidate; members: FoundSkill[] }> {
  const byDir = new Map<string, FoundSkill[]>()
  for (const f of found) byDir.set(f.dirName, [...(byDir.get(f.dirName) ?? []), f])
  const out: Array<{ candidate: SkillCandidate; members: FoundSkill[] }> = []
  const make = (id: string, members: FoundSkill[]) => {
    const first = members[0]
    const reason = members.find(m => m.reason)?.reason
    out.push({
      members,
      candidate: {
        kind: 'skill', id, dirName: first.dirName, name: first.name, description: first.description,
        locations: members.map(({ agent, root, path, linkTarget }) => ({ agent, root, path, ...(linkTarget !== undefined ? { linkTarget } : {}) })),
        contentHash: first.hash, files: first.files, importable: !reason, ...(reason ? { reason } : {}),
      },
    })
  }
  for (const [dirName, members] of [...byDir.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const agents = members.map(m => m.agent)
    const together = members.every(m => m.hash !== null && m.hash === members[0].hash) && new Set(agents).size === agents.length
    if (together) make(`skill:${dirName}`, members)
    else for (const m of members) make(members.length === 1 ? `skill:${dirName}` : `skill:${dirName}@${m.root}`, [m])
  }
  return out
}

/** Names Agent Store wrote, per agent, from every installed MCP item's targets.json. */
async function ownedMcpNames(p: ImportPaths): Promise<Record<ToolTarget, Set<string>>> {
  const owned: Record<ToolTarget, Set<string>> = { claude: new Set(), codex: new Set() }
  for (const e of (await readRegistry(p.aasHome)).installed) {
    if (e.category !== 'mcp') continue
    const targets = await readMcpTargets(itemDir(p.aasHome, 'mcp', e.slug)).catch(() => ({}))
    for (const [tool, record] of Object.entries(targets) as Array<[ToolTarget, { name: string } | undefined]>) {
      if (record) owned[tool].add(record.name)
    }
  }
  return owned
}

export interface FoundMcp {
  name: string
  entries: Partial<Record<ToolTarget, { path: string; entry: unknown }>>
}

export async function findMcps(p: ImportPaths, problems: ImportScan['problems']): Promise<FoundMcp[]> {
  const owned = await ownedMcpNames(p)
  const byName = new Map<string, FoundMcp>()
  const add = (tool: ToolTarget, path: string, servers: Record<string, unknown>) => {
    for (const [name, entry] of Object.entries(servers)) {
      if (owned[tool].has(name) || !isObject(entry)) continue
      const f = byName.get(name) ?? { name, entries: {} }
      f.entries[tool] = { path, entry }
      byName.set(name, f)
    }
  }
  try {
    const servers = (await readJsonObject(p.claudeJsonPath))?.['mcpServers']
    if (isObject(servers)) add('claude', p.claudeJsonPath, servers)
  } catch {
    problems.push({ path: p.claudeJsonPath, message: 'could not be parsed; its MCP servers are not listed' })
  }
  const toml = join(p.codexConfigDir, 'config.toml')
  try {
    add('codex', toml, await readCodexMcpServers(toml))
  } catch {
    problems.push({ path: toml, message: 'could not be parsed; its MCP servers are not listed' })
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function mcpCandidate(f: FoundMcp): McpCandidate {
  return {
    kind: 'mcp', id: `mcp:${f.name}`, name: f.name, importable: true,
    entries: (Object.entries(f.entries) as Array<[ToolTarget, { path: string; entry: unknown }]>).map(([tool, e]) => summarizeMcpEntry(tool, e.path, e.entry)),
  }
}

// ── Catalog matching: only names are sent ────────────────────────────────────

const lower = (s: string | null | undefined) => (s ?? '').toLowerCase()

async function matchSkill(catalog: Catalog, f: FoundSkill): Promise<CatalogMatch | undefined> {
  const names = new Set([lower(f.name), lower(f.dirName)].filter(Boolean))
  const result = await catalog.search(f.name ?? f.dirName, { category: 'skill', limit: 10 })
  if (result.offline) throw new Error('offline')
  let loose: CatalogMatch | undefined
  for (const r of result.resources.filter(r => names.has(lower(r.name))).slice(0, 3)) {
    const d = await catalog.get(r.id) as SkillResourceDetail
    const files = d.files ?? []
    const exact = files.length === f.blobs.size && files.every(file => f.blobs.get(file.path) === file.sha)
    // Same version string install would record (catalog/to-item.ts), so an update check starts level.
    const match = { id: d.id, name: d.name, version: d.version ?? d.origin.upstreamVersion ?? '0.0.0', exact }
    if (exact) return match
    loose ??= match
  }
  return loose
}

const stripVersion = (s: string) => s.replace(/(.)@[^/@]*$/, '$1')

/** The package or URL an entry runs: `npx -y pkg@1`, `uvx pkg`, `docker run … image`, or a remote URL. */
function mcpIdentity(entry: unknown): { packages: string[]; url?: string } {
  if (!isObject(entry)) return { packages: [] }
  if (typeof entry['url'] === 'string') return { packages: [], url: entry['url'].replace(/\/+$/, '') }
  const args = Array.isArray(entry['args']) ? entry['args'].map(String) : []
  return { packages: args.filter(a => !a.startsWith('-')).map(a => stripVersion(a).toLowerCase()) }
}

async function matchMcp(catalog: Catalog, f: FoundMcp): Promise<CatalogMatch | undefined> {
  const result = await catalog.search(f.name, { category: 'mcp', limit: 10 })
  if (result.offline) throw new Error('offline')
  const name = lower(f.name)
  const ids = Object.values(f.entries).map(e => mcpIdentity(e!.entry))
  let loose: CatalogMatch | undefined
  for (const r of result.resources.filter(r => lower(r.name) === name || lower(r.name).endsWith(`/${name}`)).slice(0, 3)) {
    const d = await catalog.get(r.id) as McpResourceDetail
    const exact = ids.some(id =>
      (d.packages ?? []).some(pkg => id.packages.includes(stripVersion(pkg.identifier).toLowerCase())) ||
      (id.url !== undefined && (d.remotes ?? []).some(rem => rem.url.replace(/\/+$/, '') === id.url)))
    const match = { id: d.id, name: d.name, version: d.version, exact }
    if (exact) return match
    loose ??= match
  }
  return loose
}

export interface ScanResult {
  scan: ImportScan
  skills: Array<{ candidate: SkillCandidate; members: FoundSkill[] }>
  mcps: Array<{ candidate: McpCandidate; found: FoundMcp }>
}

export async function scanForImport(p: ImportPaths, catalog?: Catalog, options: { matchCatalog?: boolean } = {}): Promise<ScanResult> {
  const problems: ImportScan['problems'] = []
  const [agents, found, mcpsFound] = await Promise.all([detectAgents(p), findSkills(p), findMcps(p, problems)])
  const skills = groupSkills(found)
  const mcps = mcpsFound.map(f => ({ candidate: mcpCandidate(f), found: f }))
  let catalogChecked = false
  if (catalog && options.matchCatalog) {
    try {
      for (const s of skills) {
        if (!s.candidate.importable) continue
        const m = await matchSkill(catalog, s.members[0])
        if (m) s.candidate.catalog = m
      }
      for (const m of mcps) {
        const c = await matchMcp(catalog, m.found)
        if (c) m.candidate.catalog = c
      }
      catalogChecked = true
    } catch {
      for (const s of skills) delete s.candidate.catalog
      for (const m of mcps) delete m.candidate.catalog
    }
  }
  return {
    skills, mcps,
    scan: { agents, skills: skills.map(s => s.candidate), mcps: mcps.map(m => m.candidate), catalogChecked, problems },
  }
}
