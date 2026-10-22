// --real support (§6.2): preflight, backup and restore of the user's actual
// configuration. Restore only removes what the run could have created
// (symlinks and Agent Store marker directories); anything else stops it.
import { spawnSync } from 'child_process'
import { createHash } from 'crypto'
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync,
  rmSync, statSync, writeFileSync,
} from 'fs'
import { dirname, join } from 'path'
import { PROBE_NAMES } from '../../test/accept/probes'
import { claudeMcpServers, codexConfigPath, deepEqual, readClaudeJson, sha256File } from './configs'
import { run } from './proc'
import type { Reporter } from './report'
import { skillsDirs, toolEnv, type Roots } from './roots'

interface DirEntry { name: string; type: 'symlink' | 'dir' | 'file' | 'other'; target?: string; hash?: string }
interface SkillsDirRecord { key: string; path: string; existed: boolean; entries: DirEntry[]; tar: string | null }
interface FileRecord { path: string; existed: boolean; sha256: string | null }

interface Manifest {
  version: 1
  createdAt: string
  roots: Roots
  claudeJson: FileRecord & { hadMcpServers: boolean }
  codexConfig: FileRecord
  registry: FileRecord
  skillsDirs: SkillsDirRecord[]
}

const MARKER = '.agent-store.json'

function hashTree(path: string): string {
  const h = createHash('sha256')
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      const r = rel ? `${rel}/${name}` : name
      const st = lstatSync(full)
      if (st.isSymbolicLink()) h.update(`L ${r} ${readlinkSync(full)}\n`)
      else if (st.isDirectory()) { h.update(`D ${r}\n`); walk(full, r) }
      else if (st.isFile()) h.update(`F ${r} ${createHash('sha256').update(readFileSync(full)).digest('hex')}\n`)
      else h.update(`O ${r}\n`)
    }
  }
  walk(path, '')
  return h.digest('hex')
}

// Codex installs its bundled skills into $CODEX_HOME/skills/.system on start.
const TOOL_OWNED = new Set(['.system'])

function listEntries(dir: string): DirEntry[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(name => !TOOL_OWNED.has(name)).sort().map(name => {
    const full = join(dir, name)
    const st = lstatSync(full)
    if (st.isSymbolicLink()) return { name, type: 'symlink', target: readlinkSync(full) }
    if (st.isDirectory()) return { name, type: 'dir', hash: hashTree(full) }
    if (st.isFile()) return { name, type: 'file', hash: sha256File(full)! }
    return { name, type: 'other' }
  })
}

const sameEntry = (a: DirEntry, b: DirEntry) => a.type === b.type && a.target === b.target && a.hash === b.hash

function fileRecord(path: string): FileRecord {
  return { path, existed: existsSync(path), sha256: sha256File(path) }
}

function atomicWrite(path: string, data: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true })
  const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o600
  const tmp = `${path}.as-restore-${process.pid}`
  writeFileSync(tmp, data, { mode })
  renameSync(tmp, path)
}

// ── Preflight ────────────────────────────────────────────────────────────────

export async function preflight(r: Roots, rep: Reporter, timeoutMs: number): Promise<void> {
  const dirs = skillsDirs(r)
  let servers: Record<string, unknown> = {}
  try { servers = claudeMcpServers(r) } catch (e) {
    rep.record('setup', 'preflight: .claude.json parses', 'FAIL', String(e))
  }
  let registry: Array<{ slug: string }> = []
  try {
    const path = join(r.asHome, 'registry.json')
    if (existsSync(path)) registry = JSON.parse(readFileSync(path, 'utf-8')).installed ?? []
  } catch (e) {
    rep.record('setup', 'preflight: registry.json parses', 'FAIL', String(e))
  }
  for (const name of PROBE_NAMES) {
    const clashes: string[] = []
    for (const [key, dir] of Object.entries(dirs)) if (existsSync(join(dir, name)) || isLink(join(dir, name))) clashes.push(`${key} skills dir`)
    if (name in servers) clashes.push('.claude.json mcpServers')
    const get = await run(['codex', 'mcp', 'get', name, '--json'], { env: toolEnv(r, 'real'), cwd: r.cwd, timeoutMs })
    if (get.code === 0) clashes.push('codex mcp get')
    if (registry.some(e => e.slug === name)) clashes.push('registry.json')
    rep.check('setup', `preflight: probe name ${name} is free`, clashes.length === 0, clashes.join(', ') || undefined)
  }
}

function isLink(path: string): boolean {
  try { return lstatSync(path).isSymbolicLink() } catch { return false }
}

// ── Backup ───────────────────────────────────────────────────────────────────

export function backup(r: Roots, root: string, rep: Reporter): boolean {
  if (existsSync(root)) {
    rep.record('setup', 'backup: root does not exist yet', 'FAIL', root)
    return false
  }
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const claude = readClaudeJsonSafe(r)
  if (claude === undefined) {
    rep.record('setup', 'backup: .claude.json parses', 'FAIL', r.claudeJson)
    return false
  }
  const manifest: Manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    roots: r,
    claudeJson: { ...fileRecord(r.claudeJson), hadMcpServers: 'mcpServers' in claude },
    codexConfig: fileRecord(codexConfigPath(r)),
    registry: fileRecord(join(r.asHome, 'registry.json')),
    skillsDirs: [],
  }
  writeFileSync(join(root, 'claude-mcpServers.json'), JSON.stringify(claude['mcpServers'] ?? null, null, 2), { mode: 0o600 })
  if (manifest.codexConfig.existed) copyFileSync(manifest.codexConfig.path, join(root, 'config.toml'))
  if (manifest.registry.existed) copyFileSync(manifest.registry.path, join(root, 'registry.json'))
  for (const [key, dir] of Object.entries(skillsDirs(r))) {
    const existed = existsSync(dir)
    let tar: string | null = null
    if (existed) {
      tar = `skills-${key}.tar`
      const res = spawnSync('tar', ['-cf', join(root, tar), '-C', dir, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } })
      if (res.status !== 0) {
        rep.record('setup', `backup: archive ${dir}`, 'FAIL', String(res.stderr))
        return false
      }
    }
    manifest.skillsDirs.push({ key, path: dir, existed, entries: listEntries(dir), tar })
  }
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2))
  rep.record('setup', 'backup: written', 'PASS', `${root} (${manifest.skillsDirs.map(d => `${d.key}:${d.entries.length}`).join(', ')})`)
  return true
}

function readClaudeJsonSafe(r: Roots): Record<string, unknown> | undefined {
  try { return readClaudeJson(r) } catch { return undefined }
}

export function readManifest(root: string): Manifest | undefined {
  try { return JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf-8')) as Manifest } catch { return undefined }
}

// ── Restore ──────────────────────────────────────────────────────────────────

export function restore(root: string, rep: Reporter): boolean {
  const m = readManifest(root)
  if (!m) {
    rep.record('restore', 'restore: manifest found', 'FAIL', join(root, 'manifest.json'))
    return false
  }

  // Plan first: anything we would have to delete that the run cannot have made stops the restore.
  const removals: string[] = []
  const reextract: Array<{ dir: SkillsDirRecord; name: string; displace: boolean }> = []
  const blockers: string[] = []
  for (const d of m.skillsDirs) {
    const now = listEntries(d.path)
    const saved = new Map(d.entries.map(e => [e.name, e]))
    for (const e of now) {
      const was = saved.get(e.name)
      if (!was) {
        const full = join(d.path, e.name)
        if (e.type === 'symlink' || (e.type === 'dir' && existsSync(join(full, MARKER)))) removals.push(full)
        else blockers.push(full)
      } else if (!sameEntry(e, was)) {
        reextract.push({ dir: d, name: e.name, displace: true })
      }
    }
    for (const e of d.entries) if (!now.some(n => n.name === e.name)) reextract.push({ dir: d, name: e.name, displace: false })
  }
  if (blockers.length) {
    rep.record('restore', 'restore: only Agent Store entries to remove', 'FAIL',
      `stopped for a human decision; not created by Agent Store: ${blockers.join(', ')}`)
    return false
  }

  for (const path of removals) rmSync(path, { recursive: true, force: true })
  for (const { dir, name, displace } of reextract) {
    const full = join(dir.path, name)
    if (displace) {
      // Keep what is there now next to the backup instead of deleting it.
      const aside = join(root, 'displaced', dir.key)
      mkdirSync(aside, { recursive: true })
      renameSync(full, join(aside, name))
    }
    mkdirSync(dir.path, { recursive: true })
    spawnSync('tar', ['-xf', join(root, dir.tar!), '-C', dir.path, `./${name}`])
  }

  // .claude.json: only the mcpServers subtree; Claude owns the rest.
  if (!m.claudeJson.existed) {
    rmSync(m.claudeJson.path, { force: true })
  } else {
    const current = readClaudeJsonSafe(m.roots)
    if (current === undefined) {
      rep.record('restore', 'restore: .claude.json parses', 'FAIL', m.claudeJson.path)
      return false
    }
    const saved = JSON.parse(readFileSync(join(root, 'claude-mcpServers.json'), 'utf-8'))
    if (m.claudeJson.hadMcpServers) current['mcpServers'] = saved
    else delete current['mcpServers']
    atomicWrite(m.claudeJson.path, JSON.stringify(current, null, 2))
  }
  for (const [rec, copy] of [[m.codexConfig, 'config.toml'], [m.registry, 'registry.json']] as const) {
    if (rec.existed) atomicWrite(rec.path, readFileSync(join(root, copy)))
    else rmSync(rec.path, { force: true })
  }

  // Verify against the manifest.
  let ok = true
  for (const d of m.skillsDirs) {
    const now = listEntries(d.path)
    const same = now.length === d.entries.length && d.entries.every(e => now.some(n => n.name === e.name && sameEntry(n, e)))
    ok = rep.check('restore', `restore: ${d.key} skills dir matches the backup`, same, d.path) && ok
  }
  for (const [label, rec] of [['config.toml', m.codexConfig], ['registry.json', m.registry]] as const) {
    ok = rep.check('restore', `restore: ${label} matches the backup`, sha256File(rec.path) === rec.sha256, rec.path) && ok
  }
  const claudeNow = readClaudeJsonSafe(m.roots)
  const savedServers = JSON.parse(readFileSync(join(root, 'claude-mcpServers.json'), 'utf-8'))
  const claudeSame = !m.claudeJson.existed
    ? !existsSync(m.claudeJson.path)
    : claudeNow !== undefined && deepEqual(claudeNow['mcpServers'] ?? null, savedServers)
  ok = rep.check('restore', 'restore: .claude.json mcpServers matches the backup', claudeSame, m.claudeJson.path) && ok
  return ok
}
