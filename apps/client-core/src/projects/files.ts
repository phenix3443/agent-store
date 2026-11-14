// Where each agent reads project-level skills and MCP servers, and the user-level
// state that decides whether it uses them. Paths verified against Claude Code
// 2.1.325 and codex-cli 0.166.0 (docs/project-scope.md).
import { lstat, readdir, readFile, realpath } from 'fs/promises'
import { dirname, join } from 'path'
import { parse as parseToml } from '@iarna/toml'
import type { ClaudeMcpApproval, Paths, ToolTarget } from '@as/types'
import { atomicWriteFile, backupFile, ConfigParseError, readJsonObject } from '../config/safe-file'
import { editCodexMcpTable, readCodexMcpServers } from '../config/codex-mcp'
import { parseFrontmatter } from '../skills/store'

export const CLAUDE_SKILLS = join('.claude', 'skills')
export const CODEX_SKILLS = join('.agents', 'skills')
export const CLAUDE_MCP_FILE = '.mcp.json'
export const CODEX_MCP_FILE = join('.codex', 'config.toml')

export const skillsDirFor = (agent: ToolTarget) => agent === 'claude' ? CLAUDE_SKILLS : CODEX_SKILLS
export const mcpFileFor = (agent: ToolTarget) => agent === 'claude' ? CLAUDE_MCP_FILE : CODEX_MCP_FILE

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch { return false }
}

/** The nearest directory at or above `dir` holding `.git`, or undefined. */
export async function gitRoot(dir: string): Promise<string | undefined> {
  let d = dir
  for (;;) {
    if (await exists(join(d, '.git'))) return d
    const up = dirname(d)
    if (up === d) return undefined
    d = up
  }
}

/** Codex reads `.agents/skills` in every directory from the working directory up to the repository root. */
export async function codexSkillRoots(project: string): Promise<string[]> {
  const root = await gitRoot(project)
  const roots = [join(project, CODEX_SKILLS)]
  if (!root) return roots
  for (let d = project; d !== root;) {
    d = dirname(d)
    roots.push(join(d, CODEX_SKILLS))
  }
  return roots
}

export interface FoundSkill { agent: ToolTarget; path: string; name: string; description?: string }

/** Skill directories (with a SKILL.md) under `root`; the name is the directory or the frontmatter name. */
export async function scanSkills(root: string, agent: ToolTarget): Promise<FoundSkill[]> {
  let entries: string[]
  try { entries = (await readdir(root)).sort() } catch { return [] }
  const out: FoundSkill[] = []
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const path = join(root, entry)
    let text: string
    try { text = await readFile(join(path, 'SKILL.md'), 'utf-8') } catch { continue }
    const fm = parseFrontmatter(text)
    const name = agent === 'claude' ? entry : fm?.name
    if (!name) continue
    out.push({ agent, path, name, ...(fm?.description ? { description: fm.description } : {}) })
  }
  return out
}

// ── Claude Code ──────────────────────────────────────────────────────────────

export async function readMcpJsonServers(project: string): Promise<Record<string, unknown>> {
  const path = join(project, CLAUDE_MCP_FILE)
  const json = await readJsonObject(path)
  const servers = json?.['mcpServers']
  if (servers === undefined) return {}
  if (!isObject(servers)) throw new ConfigParseError(path, 'mcpServers is not an object')
  return servers
}

/** Sets or (with undefined) drops one `.mcp.json` server, keeping every other key. */
export async function writeMcpJsonServer(aasHome: string, project: string, name: string, entry: unknown): Promise<void> {
  const path = join(project, CLAUDE_MCP_FILE)
  const json = (await readJsonObject(path)) ?? {}
  const servers = { ...(await readMcpJsonServers(project)) }
  if (entry === undefined) delete servers[name]
  else servers[name] = entry
  json['mcpServers'] = servers
  await backupFile(aasHome, path)
  await atomicWriteFile(path, JSON.stringify(json, null, 2) + '\n', 0o644)
}

async function claudeJson(paths: Required<Paths>): Promise<Record<string, unknown>> {
  try { return (await readJsonObject(paths.claudeJsonPath)) ?? {} } catch { return {} }
}

export async function claudeUserServers(paths: Required<Paths>): Promise<Record<string, unknown>> {
  const servers = (await claudeJson(paths))['mcpServers']
  return isObject(servers) ? servers : {}
}

/** Claude Code's private entries for this directory (`claude mcp add --scope local`). */
export async function claudeLocalServers(paths: Required<Paths>, project: string): Promise<Record<string, unknown>> {
  const projects = (await claudeJson(paths))['projects']
  const entry = isObject(projects) ? projects[project] : undefined
  const servers = isObject(entry) ? entry['mcpServers'] : undefined
  return isObject(servers) ? servers : {}
}

async function settings(path: string): Promise<Record<string, unknown>> {
  try { return (await readJsonObject(path)) ?? {} } catch { return {} }
}

/**
 * Approval of a `.mcp.json` server from the settings Claude Code records it in:
 * the project's `.claude/settings.local.json` (where its prompt writes the answer),
 * `.claude/settings.json` and the user's settings.json. Claude Code also wants the
 * folder trusted before it asks, which is not checked here.
 */
export async function claudeApprovals(paths: Required<Paths>, project: string): Promise<(name: string) => ClaudeMcpApproval> {
  const all = await Promise.all([
    settings(join(project, '.claude', 'settings.local.json')),
    settings(join(project, '.claude', 'settings.json')),
    settings(join(paths.claudeConfigDir, 'settings.json')),
  ])
  const list = (key: string) => all.flatMap(s => Array.isArray(s[key]) ? (s[key] as unknown[]).filter((x): x is string => typeof x === 'string') : [])
  const disabled = new Set(list('disabledMcpjsonServers'))
  const enabled = new Set(list('enabledMcpjsonServers'))
  const all_ = all.some(s => s['enableAllProjectMcpServers'] === true)
  return name => disabled.has(name) ? 'rejected' : enabled.has(name) || all_ ? 'approved' : 'pending'
}

// ── Codex ────────────────────────────────────────────────────────────────────

export function readCodexProjectServers(project: string): Promise<Record<string, unknown>> {
  return readCodexMcpServers(join(project, CODEX_MCP_FILE))
}

export function writeCodexProjectServer(aasHome: string, project: string, name: string, entry: Record<string, unknown> | undefined): Promise<void> {
  return editCodexMcpTable(aasHome, join(project, CODEX_MCP_FILE), name, entry, 0o644)
}

async function codexUserConfig(paths: Required<Paths>): Promise<Record<string, unknown>> {
  try { return parseToml(await readFile(join(paths.codexConfigDir, 'config.toml'), 'utf-8')) as Record<string, unknown> } catch { return {} }
}

export async function codexUserServers(paths: Required<Paths>): Promise<Record<string, unknown>> {
  const servers = (await codexUserConfig(paths))['mcp_servers']
  return isObject(servers) ? servers : {}
}

/**
 * Codex trusts a project through `[projects."<path>"] trust_level = "trusted"` in the
 * user's config.toml, for the directory itself or its repository root. A `-c`
 * override does not count (tested), so only the file is read.
 */
export async function codexTrusted(paths: Required<Paths>, project: string): Promise<boolean> {
  const projects = (await codexUserConfig(paths))['projects']
  if (!isObject(projects)) return false
  const candidates = new Set([project])
  const root = await gitRoot(project)
  if (root) candidates.add(root)
  for (const [path, table] of Object.entries(projects)) {
    if (!isObject(table) || table['trust_level'] !== 'trusted') continue
    let real = path
    try { real = await realpath(path) } catch { /* compare as written */ }
    if (candidates.has(real) || candidates.has(path.replace(/\/+$/, ''))) return true
  }
  return false
}
