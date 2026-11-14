// Registered projects and what Agent Store installed into each one:
// ~/.agent-store/projects.json. Values for the variables project MCP entries
// reference live apart from it, in ~/.agent-store/project-env.json (0600), because
// the project files themselves are committed and must never hold them.
import { randomUUID } from 'crypto'
import { mkdir, readFile, realpath, stat } from 'fs/promises'
import { basename, join, resolve } from 'path'
import lockfile from 'proper-lockfile'
import type { Project, ToolTarget } from '@as/types'
import { atomicWriteFile, atomicWriteSecretFile, ConfigParseError } from '../config/safe-file'

export interface SkillTargetRecord {
  /** Relative to the project directory, so a moved project keeps its records. */
  path: string
  /** contentHash of the copy right after it was written. */
  hash: string
}

export interface McpTargetRecord {
  /** The entry as written, compared with what is in the file now. */
  written: unknown
}

interface ItemRecordBase {
  slug: string
  version: string
  resourceId?: string
  /** Skill name or MCP server name the agents see. */
  name: string
  installedAt: string
  updatedAt: string
}

export interface SkillRecord extends ItemRecordBase {
  kind: 'skill'
  targets: Partial<Record<ToolTarget, SkillTargetRecord>>
}

export interface McpRecord extends ItemRecordBase {
  kind: 'mcp'
  targets: Partial<Record<ToolTarget, McpTargetRecord>>
  env: string[]
}

export type ItemRecord = SkillRecord | McpRecord

export interface ProjectRecord {
  id: string
  path: string
  name: string
  addedAt: string
  items: ItemRecord[]
}

export interface ProjectsFile {
  projects: ProjectRecord[]
}

export class ProjectNotFoundError extends Error {
  readonly reason = 'project-not-found'
  constructor(readonly ref: string) {
    super(`No registered project matches ${JSON.stringify(ref)}; see: aas projects list`)
    this.name = 'ProjectNotFoundError'
  }
}

export class ProjectPathError extends Error {
  constructor(message: string, readonly reason: 'missing' | 'not-a-directory' | 'already-registered') {
    super(message)
    this.name = 'ProjectPathError'
  }
}

const projectsPath = (aasHome: string) => join(aasHome, 'projects.json')
const envPath = (aasHome: string) => join(aasHome, 'project-env.json')

async function readJson<T>(path: string, empty: T, valid: (v: unknown) => boolean): Promise<T> {
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return empty
    throw e
  }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch (e) { throw new ConfigParseError(path, (e as Error).message) }
  if (!valid(parsed)) throw new ConfigParseError(path, 'unexpected shape')
  return parsed as T
}

export function readProjects(aasHome: string): Promise<ProjectsFile> {
  return readJson<ProjectsFile>(projectsPath(aasHome), { projects: [] }, v => Array.isArray((v as ProjectsFile | null)?.projects))
}

async function withLock<T>(aasHome: string, path: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(aasHome, { recursive: true })
  let release: () => Promise<void>
  try {
    release = await lockfile.lock(path, {
      realpath: false,
      lockfilePath: `${path}.lock`,
      retries: { retries: 100, factor: 1.2, minTimeout: 20, maxTimeout: 500 },
    })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ELOCKED') throw new Error(`${path} is locked by another Agent Store process; try again`)
    throw e
  }
  try {
    return await fn()
  } finally {
    await release()
  }
}

/**
 * Read-modify-write under a cross-process lock. `mutate` may write project files
 * too, so a check and the write it allows happen with no other Agent Store process
 * in between.
 */
export async function updateProjects<T>(aasHome: string, mutate: (file: ProjectsFile) => Promise<T>): Promise<T> {
  const path = projectsPath(aasHome)
  return withLock(aasHome, path, async () => {
    const file = await readProjects(aasHome)
    try {
      return await mutate(file)
    } finally {
      // Whatever mutate recorded before a failure stays: those files are on disk.
      await atomicWriteFile(path, JSON.stringify(file, null, 2) + '\n')
    }
  })
}

/** Absolute, symlinks resolved, no trailing slash; throws when the directory does not exist. */
export async function canonicalDir(path: string): Promise<string> {
  const abs = resolve(path)
  let real: string
  try {
    real = await realpath(abs)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new ProjectPathError(`${abs} does not exist; nothing was created`, 'missing')
    throw e
  }
  if (!(await stat(real)).isDirectory()) throw new ProjectPathError(`${abs} is not a directory`, 'not-a-directory')
  return real
}

async function exists(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory() } catch { return false }
}

export async function toProject(record: ProjectRecord): Promise<Project> {
  return { id: record.id, path: record.path, name: record.name, addedAt: record.addedAt, exists: await exists(record.path) }
}

/** By id, else by path: the stored path as typed, or the canonical path of an existing directory. */
export async function findProject(file: ProjectsFile, ref: string): Promise<ProjectRecord> {
  const byId = file.projects.find(p => p.id === ref)
  if (byId) return byId
  const abs = resolve(ref)
  const byPath = file.projects.find(p => p.path === abs)
  if (byPath) return byPath
  let real: string | undefined
  try { real = await realpath(abs) } catch { /* gone: only the stored path can match */ }
  const byReal = real && file.projects.find(p => p.path === real)
  if (byReal) return byReal
  throw new ProjectNotFoundError(ref)
}

export async function addProjectRecord(aasHome: string, path: string, name?: string): Promise<Project> {
  const dir = await canonicalDir(path)
  return updateProjects(aasHome, async file => {
    const same = file.projects.find(p => p.path === dir)
    if (same) throw new ProjectPathError(`${dir} is already registered as ${JSON.stringify(same.name)} (${same.id})`, 'already-registered')
    const record: ProjectRecord = { id: randomUUID(), path: dir, name: name?.trim() || basename(dir), addedAt: new Date().toISOString(), items: [] }
    file.projects.push(record)
    return toProject(record)
  })
}

export async function removeProjectRecord(aasHome: string, ref: string): Promise<void> {
  const id = await updateProjects(aasHome, async file => {
    const record = await findProject(file, ref)
    file.projects = file.projects.filter(p => p.id !== record.id)
    return record.id
  })
  await updateProjectEnv(aasHome, env => { delete env[id] })
}

export async function relocateProjectRecord(aasHome: string, ref: string, newPath: string): Promise<Project> {
  const dir = await canonicalDir(newPath)
  return updateProjects(aasHome, async file => {
    const record = await findProject(file, ref)
    const other = file.projects.find(p => p.path === dir && p.id !== record.id)
    if (other) throw new ProjectPathError(`${dir} is already registered as ${JSON.stringify(other.name)} (${other.id})`, 'already-registered')
    record.path = dir
    return toProject(record)
  })
}

// ── Stored variable values ───────────────────────────────────────────────────

type EnvFile = Record<string, Record<string, string>>

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export function assertEnvName(name: string): string {
  if (!ENV_NAME.test(name)) throw new Error(`Invalid environment variable name ${JSON.stringify(name)}`)
  return name
}

function readEnvFile(aasHome: string): Promise<EnvFile> {
  return readJson<EnvFile>(envPath(aasHome), {}, v => typeof v === 'object' && v !== null && !Array.isArray(v))
}

async function updateProjectEnv(aasHome: string, mutate: (env: EnvFile) => void): Promise<void> {
  const path = envPath(aasHome)
  await withLock(aasHome, path, async () => {
    const env = await readEnvFile(aasHome)
    mutate(env)
    await atomicWriteSecretFile(path, JSON.stringify(env, null, 2) + '\n')
  })
}

export async function readProjectEnv(aasHome: string, projectId: string): Promise<Record<string, string>> {
  return { ...((await readEnvFile(aasHome))[projectId] ?? {}) }
}

export async function setProjectEnvValue(aasHome: string, projectId: string, name: string, value: string | undefined): Promise<void> {
  assertEnvName(name)
  if (value !== undefined && /[\r\n\0]/.test(value)) throw new Error(`The value for ${name} contains a newline or NUL`)
  await updateProjectEnv(aasHome, env => {
    const values = { ...(env[projectId] ?? {}) }
    if (value === undefined) delete values[name]
    else values[name] = value
    if (Object.keys(values).length) env[projectId] = values
    else delete env[projectId]
  })
}
