// Backup to a Git repository the user owns, and sync between devices (issue #112).
// docs/backup-sync.md describes the behavior; the merge itself is merge.ts.
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { hostname, tmpdir } from 'os'
import { join } from 'path'
import lockfile from 'proper-lockfile'
import type {
  BackupAppliedChange, BackupConflict, BackupConflictChoice, BackupConnectOptions, BackupConnectResult,
  BackupFailure, BackupHistoryEntry, BackupItemRef, BackupMissingSecret, BackupResolveResult, BackupRestoreResult,
  BackupSnapshot, BackupStatus, BackupSyncResult, Engine, Paths,
} from '@as/types'
import type { Catalog } from '../catalog'
import { assertSafeSlug } from '../paths'
import { findEntry, readRegistry } from '../registry/index'
import { applyItem, installCopy, type ApplyContext, type ApplyOutcome } from './apply'
import { DEFAULT_MAX_ITEM_BYTES, exportLocal, type ExportResult, type WantedTarget } from './export'
import { splitRemoteCredentials, type GitCredentials } from './git'
import { copyEntries, FORMAT, FORMAT_FILE, itemPath, listTree, parseKey, stableJson } from './layout'
import { decide, type Decision } from './merge'
import { BackupRepo, type Author, type ItemIds } from './repo'
import { BackupSecretError, scanTree, type SecretFinding } from './secrets'
import {
  backupDir, gitDirOf, lockPath, lockTarget, readConnection, readCredentials, readState, writeConnection,
  writeCredentials, writeState, type BlockedTarget, type Connection, type SyncState,
} from './state'

const SNAPSHOT_PREFIX = 'refs/agent-store/snapshots/'
const KEEP_SNAPSHOTS = 30
const PUSH_ATTEMPTS = 3

export class BackupNotConnectedError extends Error {
  readonly reason = 'not-connected'
  constructor() {
    super('This device is not connected to a backup; connect with: aas backup connect <git-url>')
    this.name = 'BackupNotConnectedError'
  }
}

export class BackupAlreadyConnectedError extends Error {
  readonly reason = 'already-connected'
  constructor(remote: string) {
    super(`This device is already connected to ${remote}; run aas backup disconnect first`)
    this.name = 'BackupAlreadyConnectedError'
  }
}

export class BackupRemoteRefusedError extends Error {
  constructor(message: string, readonly reason: 'foreign-repo' | 'unsupported-schema' | 'token-needs-https') {
    super(message)
    this.name = 'BackupRemoteRefusedError'
  }
}

export class BackupNotFoundError extends Error {
  constructor(message: string, readonly reason: 'no-conflict' | 'no-snapshot' | 'ambiguous') {
    super(message)
    this.name = 'BackupNotFoundError'
  }
}

export interface BackupServiceOptions {
  engine: Engine
  /** An engine that installs from `catalog` (the backup) instead of the store. */
  engineFor: (catalog: Catalog) => Engine
  maxItemBytes?: number
}

const ref = (key: string): BackupItemRef => ({ key, ...parseKey(key) })

const same = (a: ItemIds | undefined, b: ItemIds | undefined) => a?.content === b?.content && a?.state === b?.state

function deviceSlug(device: string | undefined): string {
  const s = (device ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return s || 'remote'
}

async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'as-backup-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function subdir(root: string, name: string): Promise<string> {
  const dir = join(root, name)
  await mkdir(dir, { recursive: true })
  return dir
}

function missingSecrets(blocked: BlockedTarget[]): BackupMissingSecret[] {
  const out = new Map<string, BackupMissingSecret>()
  for (const b of blocked) {
    if (b.reason === 'error') continue
    const id = `${b.key}\0${b.reason}`
    const m = out.get(id)
    if (m) m.targets.push(b.target)
    else out.set(id, { key: b.key, category: b.category, slug: b.slug, targets: [b.target], reason: b.reason, message: b.message })
  }
  return [...out.values()]
}

function failures(state: SyncState): BackupFailure[] {
  const at = new Date().toISOString()
  return [
    ...state.failed,
    ...state.blocked.filter(b => b.reason === 'error').map(b => ({ key: b.key, category: b.category, slug: b.slug, message: `${b.target}: ${b.message}`, at })),
  ]
}

async function checkFormat(repo: BackupRepo, head: string, where: { remote: string; branch: string }): Promise<void> {
  const raw = await repo.readBlob(head, FORMAT_FILE)
  let parsed: { format?: unknown; schema?: unknown } | undefined
  try { parsed = raw ? JSON.parse(raw) : undefined } catch { /* refused below */ }
  if (parsed?.format !== FORMAT.format) {
    throw new BackupRemoteRefusedError(`Branch ${where.branch} of ${where.remote} already has content that is not an Agent Store backup; nothing was changed. Use an empty repository or another branch`, 'foreign-repo')
  }
  if (parsed.schema !== FORMAT.schema) {
    throw new BackupRemoteRefusedError(`The backup on ${where.remote} uses format ${String(parsed.schema)}; update Agent Store to use it`, 'unsupported-schema')
  }
}

interface LocalExport {
  tree: string
  result: ExportResult
  dir: string
}

interface Session {
  conn: Connection
  repo: BackupRepo
  state: SyncState
  credentials?: GitCredentials
}

export class BackupService {
  private readonly maxItemBytes: number

  constructor(private readonly paths: Required<Paths>, private readonly options: BackupServiceOptions) {
    this.maxItemBytes = options.maxItemBytes ?? DEFAULT_MAX_ITEM_BYTES
  }

  private get aasHome(): string {
    return this.paths.aasHome
  }

  private get applyContext(): ApplyContext {
    return { paths: this.paths, engine: this.options.engine, engineFor: this.options.engineFor }
  }

  private async locked<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(this.aasHome, { recursive: true })
    let release: () => Promise<void>
    try {
      release = await lockfile.lock(lockTarget(this.aasHome), {
        realpath: false, lockfilePath: lockPath(this.aasHome), retries: { retries: 5, minTimeout: 100, maxTimeout: 1000 },
      })
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ELOCKED') throw new Error('Another backup operation is running; try again when it has finished')
      throw e
    }
    try {
      return await fn()
    } finally {
      await release()
    }
  }

  private async session(): Promise<Session> {
    const conn = await readConnection(this.aasHome)
    if (!conn) throw new BackupNotConnectedError()
    const credentials = await readCredentials(this.aasHome)
    const state = await this.freshState(await readState(this.aasHome))
    return { conn, repo: new BackupRepo(gitDirOf(this.aasHome), credentials), state, credentials }
  }

  /** Drops what no longer holds: targets enabled since, items uninstalled since. */
  private async freshState(state: SyncState): Promise<SyncState> {
    const registry = await readRegistry(this.aasHome)
    state.blocked = state.blocked.filter(b => {
      const e = findEntry(registry, b.slug)
      return e && e.category === b.category && e.enabledFor[b.target] !== true
    })
    return state
  }

  private author(conn: Connection): Author {
    return { name: conn.device, email: `${deviceSlug(conn.device)}@agent-store.local` }
  }

  /** Exports this machine into `dir`, checks it for secrets, and writes its tree. */
  private async exportTree(s: Session, dir: string): Promise<LocalExport> {
    const wanted: WantedTarget[] = s.state.blocked.map(b => ({ key: b.key, target: b.target }))
    const extraSecrets = s.credentials ? [{ value: s.credentials.password, source: 'the backup token' }] : []
    const result = await exportLocal(this.paths, dir, { maxItemBytes: this.maxItemBytes, wanted, extraSecrets })
    const findings = await scanTree(dir, result.known)
    if (findings.length) throw new BackupSecretError(findings)
    return { tree: await s.repo.writeTree(dir), result, dir }
  }

  private async snapshotRefs(repo: BackupRepo) {
    const refs = await repo.refs(SNAPSHOT_PREFIX)
    return refs.map(r => ({ ...r, id: r.ref.slice(SNAPSHOT_PREFIX.length) })).sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
  }

  /** The snapshot holding `tree`: the newest one when it already does, else a new one. */
  private async snapshot(s: Session, tree: string, reason: string): Promise<string> {
    const refs = await this.snapshotRefs(s.repo)
    if (refs[0] && (await s.repo.treeOf(refs[0].commit)) === tree) return refs[0].id
    const base = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
    let id = base
    for (let n = 2; refs.some(r => r.id === id); n++) id = `${base}-${n}`
    const commit = await s.repo.commit(tree, [], `${reason}\n\nAgent-Store-Device: ${s.conn.device}\n`, this.author(s.conn))
    await s.repo.setRef(SNAPSHOT_PREFIX + id, commit)
    for (const old of [{ id }, ...refs].slice(KEEP_SNAPSHOTS)) await s.repo.deleteRef(SNAPSHOT_PREFIX + old.id)
    return id
  }

  private message(conn: Connection, uploaded: Array<{ key: string; mark: '+' | '~' | '-' }>): string {
    const lines = uploaded.map(u => `${u.mark} ${u.key}`)
    return `${conn.device}: back up ${uploaded.length} item${uploaded.length === 1 ? '' : 's'}\n\n${lines.join('\n')}\n\nAgent-Store-Device: ${conn.device}\n`
  }

  /** Copies the parts of `key` this machine wins from the local export into `result`. */
  private async overlay(localDir: string, resultDir: string, key: string, d: Decision, local: ItemIds | undefined): Promise<void> {
    const dest = join(resultDir, itemPath(key))
    if (!local) {
      await rm(dest, { recursive: true, force: true })
      return
    }
    const src = join(localDir, itemPath(key))
    await mkdir(dest, { recursive: true })
    if (d.take.content === 'local') {
      await rm(join(dest, 'content'), { recursive: true, force: true })
      await copyEntries(join(src, 'content'), join(dest, 'content'), await listTree(join(src, 'content'), () => false))
    }
    if (d.take.state === 'local') await copyFile(join(src, 'state.json'), join(dest, 'state.json'))
  }

  private async applyAll(
    root: string, targets: Array<{ key: string; parts: { content: boolean; state: boolean } }>,
  ): Promise<{ applied: BackupAppliedChange[]; outcomes: Map<string, ApplyOutcome>; errors: Map<string, string> }> {
    const applied: BackupAppliedChange[] = []
    const outcomes = new Map<string, ApplyOutcome>()
    const errors = new Map<string, string>()
    for (const t of targets) {
      try {
        const o = await applyItem(this.applyContext, root, t.key, t.parts)
        outcomes.set(t.key, o)
        if (o.actions.length) applied.push({ ...ref(t.key), actions: o.actions })
      } catch (e) {
        errors.set(t.key, e instanceof Error ? e.message : String(e))
      }
    }
    return { applied, outcomes, errors }
  }

  /** Re-exports and returns the keys whose parts still differ from `target`. */
  private async stillDifferent(s: Session, scratch: string, target: Map<string, ItemIds>, keys: Array<{ key: string; content: boolean; state: boolean }>): Promise<Set<string>> {
    const out = new Set<string>()
    if (!keys.length) return out
    const dir = await subdir(scratch, 'verify')
    const exported = await this.exportTree(s, dir)
    const now = await s.repo.items(exported.tree)
    for (const k of keys) {
      const a = now.get(k.key)
      const b = target.get(k.key)
      if (!a !== !b || (k.content && a?.content !== b?.content) || (k.state && a?.state !== b?.state)) out.add(k.key)
    }
    return out
  }

  /** The remote head, refusing a remote that lost the backup or holds something else. */
  private async fetchChecked(s: Session): Promise<string | null> {
    const head = await s.repo.fetch(s.conn.branch)
    if (!head) {
      if (s.state.lastSync) {
        throw new BackupRemoteRefusedError(`Branch ${s.conn.branch} is gone from ${s.conn.remote}; nothing was changed here. To start a new backup there, run aas backup disconnect and connect again`, 'foreign-repo')
      }
      return null
    }
    await checkFormat(s.repo, head, s.conn)
    return head
  }

  private async sync(mode: 'now' | 'pull'): Promise<BackupSyncResult> {
    return this.locked(async () => {
      const s = await this.session()
      return withTemp(async scratch => {
        const local = await this.exportTree(s, await subdir(scratch, 'local'))
        const snapshot = await this.snapshot(s, local.tree, mode === 'now' ? 'Before backing up' : 'Before pulling')
        const localItems = await s.repo.items(local.tree)
        const notRestorable = new Set(s.state.notRestorable.map(n => n.key).filter(k => !localItems.has(k)))
        const localIsBase = new Set([...s.state.failed.map(f => f.key), ...notRestorable])

        let pushed: string | null = null
        let synced: string | null = null
        let targetDir = ''
        let remoteItems = new Map<string, ItemIds>()
        let remoteCommit: string | null = null
        let decisions: Decision[] = []
        let uploaded: Array<{ key: string; mark: '+' | '~' | '-' }> = []
        for (let attempt = 1; ; attempt++) {
          remoteCommit = await this.fetchChecked(s)
          const remoteTree = remoteCommit ? await s.repo.treeOf(remoteCommit) : null
          remoteItems = await s.repo.items(remoteTree)
          // A rewritten remote history says nothing about what was deleted since; without a base nothing is.
          const base = s.state.lastSync && remoteCommit && (await s.repo.isAncestor(s.state.lastSync.commit, remoteCommit)) ? s.state.lastSync.commit : null
          const baseItems = await s.repo.items(base ? await s.repo.treeOf(base) : null)
          decisions = decide({
            base: baseItems, local: localItems, remote: remoteItems,
            pending: new Set(s.state.conflicts.map(c => c.key)), localIsBase,
          })
          targetDir = await subdir(scratch, `remote-${attempt}`)
          if (remoteTree) await s.repo.materialize(remoteTree, targetDir)
          if (mode === 'pull') {
            synced = remoteCommit ?? s.state.lastSync?.commit ?? null
            break
          }
          uploaded = []
          for (const d of decisions) {
            if (d.conflict) continue
            const l = localItems.get(d.key)
            const r = remoteItems.get(d.key)
            const wins = (d.take.content === 'local' && l?.content !== r?.content) || (d.take.state === 'local' && l?.state !== r?.state)
            if (!wins) continue
            await this.overlay(local.dir, targetDir, d.key, d, l)
            uploaded.push({ key: d.key, mark: !l ? '-' : !r ? '+' : '~' })
          }
          await writeFile(join(targetDir, FORMAT_FILE), stableJson(FORMAT))
          const resultTree = await s.repo.writeTree(targetDir)
          if (resultTree === remoteTree) {
            synced = remoteCommit
            break
          }
          const commit = await s.repo.commit(resultTree, remoteCommit ? [remoteCommit] : [], this.message(s.conn, uploaded), this.author(s.conn))
          if (await s.repo.push(commit, s.conn.branch)) {
            pushed = commit
            synced = commit
            break
          }
          if (attempt >= PUSH_ATTEMPTS) throw new Error('The backup kept changing on the remote while uploading; nothing was applied here, try again')
        }

        const targetItems = await s.repo.items(synced ? await s.repo.treeOf(synced) : null)
        const toApply = decisions.flatMap(d => {
          if (d.conflict) return []
          const l = localItems.get(d.key)
          const r = remoteItems.get(d.key)
          const content = d.take.content === 'remote' && l?.content !== r?.content && !d.keepLocalContent
          const state = d.take.state === 'remote' && l?.state !== r?.state
          // A failed item is retried even when its export looks unchanged.
          const retry = localIsBase.has(d.key) && !same(l, r)
          return content || state || retry ? [{ key: d.key, parts: { content: content || (retry && !d.keepLocalContent), state: state || retry } }] : []
        })
        const { applied, outcomes, errors } = await this.applyAll(targetDir, toApply)
        const appliedKeys = new Set(toApply.map(t => t.key))
        const blocked = [
          ...s.state.blocked.filter(b => !appliedKeys.has(b.key)),
          ...[...outcomes.values()].flatMap(o => o.blocked),
        ]
        s.state.blocked = blocked
        const differ = await this.stillDifferent(s, scratch, targetItems,
          toApply.filter(t => !errors.has(t.key) && !outcomes.get(t.key)?.notRestorable).map(t => ({ key: t.key, ...t.parts })))

        const now = new Date().toISOString()
        const oldConflicts = new Map(s.state.conflicts.map(c => [c.key, c]))
        const conflicts: BackupConflict[] = []
        for (const d of decisions) {
          if (!d.conflict) continue
          const old = oldConflicts.get(d.key)
          const remoteDevice = remoteCommit ? await s.repo.lastAuthor(remoteCommit, itemPath(d.key)) : undefined
          conflicts.push({ ...ref(d.key), reason: d.conflict.reason, parts: d.conflict.parts, ...(remoteDevice ? { remoteDevice } : {}), detectedAt: old?.detectedAt ?? now })
        }
        const failed: BackupFailure[] = [
          ...s.state.failed.filter(f => !appliedKeys.has(f.key) && !same(localItems.get(f.key), remoteItems.get(f.key))),
          ...[...errors].map(([key, message]) => ({ ...ref(key), message, at: now })),
          ...[...differ].map(key => ({ ...ref(key), message: 'after applying the backup, this machine still differs from it', at: now })),
        ]
        const restorable = [...s.state.notRestorable.filter(n => !appliedKeys.has(n.key)), ...toApply.filter(t => outcomes.get(t.key)?.notRestorable).map(t => ref(t.key))]
          .filter(n => targetItems.has(n.key) && !localItems.has(n.key))
        const state: SyncState = {
          ...(synced ? { lastSync: { commit: synced, at: now } } : s.state.lastSync ? { lastSync: s.state.lastSync } : {}),
          conflicts, blocked, failed, notRestorable: restorable,
        }
        await writeState(this.aasHome, state)
        return {
          pushed,
          uploaded: uploaded.map(u => ref(u.key)),
          applied,
          snapshot,
          conflicts,
          missingSecrets: missingSecrets(blocked),
          failed: failures(state),
          localOnly: local.result.localOnly,
          notRestorable: restorable,
          excludedFiles: local.result.excludedFiles,
        }
      })
    })
  }

  backupNow(): Promise<BackupSyncResult> {
    return this.sync('now')
  }

  pull(): Promise<BackupSyncResult> {
    return this.sync('pull')
  }

  async connect(options: BackupConnectOptions): Promise<BackupConnectResult> {
    return this.locked(async () => {
      const existing = await readConnection(this.aasHome)
      if (existing) throw new BackupAlreadyConnectedError(existing.remote)
      const split = splitRemoteCredentials(options.remote.trim())
      if (options.token && !/^https?:\/\//i.test(split.remote)) {
        throw new BackupRemoteRefusedError('A token is only used for HTTPS remotes; SSH remotes use your SSH keys', 'token-needs-https')
      }
      const credentials: GitCredentials | undefined = options.token
        ? { username: options.username || split.credentials?.username || 'x-access-token', password: options.token }
        : split.credentials
      const defaultBranch = await BackupRepo.remoteDefaultBranch(split.remote, credentials)
      const branch = options.branch?.trim() || defaultBranch || 'main'
      const device = options.device?.trim() || hostname() || 'device'
      await rm(backupDir(this.aasHome), { recursive: true, force: true })
      await mkdir(backupDir(this.aasHome), { recursive: true, mode: 0o700 })
      try {
        if (credentials) await writeCredentials(this.aasHome, credentials)
        const repo = await BackupRepo.init(gitDirOf(this.aasHome), split.remote, branch, credentials)
        const head = await repo.fetch(branch)
        let remoteItems = 0
        if (head) {
          await checkFormat(repo, head, { remote: split.remote, branch })
          remoteItems = (await repo.items(head)).size
        }
        await writeState(this.aasHome, { conflicts: [], blocked: [], failed: [], notRestorable: [] })
        await writeConnection(this.aasHome, { remote: split.remote, branch, device, connectedAt: new Date().toISOString() })
        return { status: await this.statusOf({ fetch: false }), remoteItems }
      } catch (e) {
        await rm(backupDir(this.aasHome), { recursive: true, force: true })
        throw e
      }
    })
  }

  private async statusOf(options: { fetch?: boolean }): Promise<BackupStatus> {
    const conn = await readConnection(this.aasHome)
    const empty: BackupStatus = {
      connected: false, localChanges: [], remoteAhead: null, conflicts: [], missingSecrets: [], failed: [],
      localOnly: [], notRestorable: [], excludedFiles: [], secretFindings: [],
    }
    if (!conn) return empty
    const s = await this.session()
    const status: BackupStatus = {
      ...empty,
      connected: true,
      remote: conn.remote,
      branch: conn.branch,
      device: conn.device,
      connectedAt: conn.connectedAt,
      hasCredentials: !!s.credentials,
      ...(s.state.lastSync ? { lastSync: s.state.lastSync } : {}),
      conflicts: s.state.conflicts,
      missingSecrets: missingSecrets(s.state.blocked),
      failed: failures(s.state),
      notRestorable: s.state.notRestorable,
    }
    await withTemp(async scratch => {
      let exported: LocalExport
      try {
        exported = await this.exportTree(s, scratch)
      } catch (e) {
        if (e instanceof BackupSecretError) {
          status.secretFindings = e.findings as SecretFinding[]
          return
        }
        throw e
      }
      const local = await s.repo.items(exported.tree)
      const base = await s.repo.items(s.state.lastSync ? await s.repo.treeOf(s.state.lastSync.commit) : null)
      const keys = [...new Set([...local.keys(), ...base.keys()])].sort()
      status.localChanges = keys.filter(k => !same(local.get(k), base.get(k))).map(ref)
      status.localOnly = exported.result.localOnly
      status.excludedFiles = exported.result.excludedFiles
    })
    if (options.fetch) {
      const head = await s.repo.fetch(conn.branch)
      status.remoteAhead = head ? await s.repo.countBetween(s.state.lastSync?.commit ?? null, head) : 0
    }
    return status
  }

  status(options: { fetch?: boolean } = {}): Promise<BackupStatus> {
    return this.locked(() => this.statusOf(options))
  }

  private findConflict(state: SyncState, item: string): BackupConflict {
    const matches = state.conflicts.filter(c => c.key === item || c.slug === item)
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) throw new BackupNotFoundError(`${item} matches ${matches.map(m => m.key).join(' and ')}; name it as <kind>/<slug>`, 'ambiguous')
    throw new BackupNotFoundError(`No pending backup conflict for ${item}; see: aas backup conflicts`, 'no-conflict')
  }

  async resolve(item: string, choice: BackupConflictChoice): Promise<BackupResolveResult> {
    return this.locked(async () => {
      const s = await this.session()
      const conflict = this.findConflict(s.state, item)
      return withTemp(async scratch => {
        const local = await this.exportTree(s, await subdir(scratch, 'local'))
        const snapshot = await this.snapshot(s, local.tree, `Before resolving ${conflict.key} (${choice})`)
        const root = await subdir(scratch, 'remote')
        const base = s.state.lastSync?.commit
        if (base) await s.repo.materialize(await s.repo.treeOf(base), root)
        const remote = (await s.repo.items(base ?? null)).get(conflict.key)
        const here = (await s.repo.items(local.tree)).get(conflict.key)
        let effective: BackupConflictChoice = choice
        if (choice === 'both' && (!remote || !here)) effective = remote ? 'remote' : 'local'
        const result: BackupResolveResult = { item: ref(conflict.key), choice, snapshot, applied: [], missingSecrets: [] }
        let blocked: BlockedTarget[] = []
        if (effective === 'remote') {
          const o = await applyItem(this.applyContext, root, conflict.key, { content: true, state: true })
          if (o.actions.length) result.applied.push({ ...ref(conflict.key), actions: o.actions })
          blocked = o.blocked
        } else if (effective === 'both') {
          const registry = await readRegistry(this.aasHome)
          const stem = `${conflict.slug}-${deviceSlug(conflict.remoteDevice)}`.slice(0, 120).replace(/[-.]+$/, '')
          let slug = stem
          for (let n = 2; findEntry(registry, slug); n++) slug = `${stem}-${n}`
          assertSafeSlug(slug)
          await installCopy(this.applyContext, root, conflict.key, slug)
          result.keptAs = slug
          result.applied.push({ key: `${conflict.category}/${slug}`, category: conflict.category, slug, actions: ['installed'] })
        }
        result.missingSecrets = missingSecrets(blocked)
        await writeState(this.aasHome, {
          ...s.state,
          conflicts: s.state.conflicts.filter(c => c.key !== conflict.key),
          failed: s.state.failed.filter(f => f.key !== conflict.key),
          blocked: [...s.state.blocked.filter(b => b.key !== conflict.key), ...blocked],
        })
        return result
      })
    })
  }

  async snapshots(): Promise<BackupSnapshot[]> {
    return this.locked(async () => {
      const s = await this.session()
      return (await this.snapshotRefs(s.repo)).map(r => ({ id: r.id, createdAt: r.at, reason: r.subject }))
    })
  }

  async restore(id: string): Promise<BackupRestoreResult> {
    return this.locked(async () => {
      const s = await this.session()
      const commit = await s.repo.resolve(SNAPSHOT_PREFIX + id)
      if (!commit || id.includes('/')) throw new BackupNotFoundError(`No snapshot ${id}; see: aas backup snapshots`, 'no-snapshot')
      return withTemp(async scratch => {
        const local = await this.exportTree(s, await subdir(scratch, 'local'))
        const snapshot = await this.snapshot(s, local.tree, `Before restoring ${id}`)
        const root = await subdir(scratch, 'snapshot')
        const tree = await s.repo.treeOf(commit)
        await s.repo.materialize(tree, root)
        const target = await s.repo.items(tree)
        const here = await s.repo.items(local.tree)
        const placeholder = (ids: ItemIds | undefined, key: string) => key.startsWith('skill/') && !!ids && !ids.hasFiles
        const toApply = [...new Set([...target.keys(), ...here.keys()])].sort().flatMap(key => {
          const t = target.get(key)
          const h = here.get(key)
          if (same(t, h)) return []
          const keepContent = placeholder(t, key) || placeholder(h, key)
          return [{ key, parts: { content: t?.content !== h?.content && !keepContent, state: t?.state !== h?.state } }]
        })
        const { applied, outcomes, errors } = await this.applyAll(root, toApply)
        const blocked = [...outcomes.values()].flatMap(o => o.blocked)
        const appliedKeys = new Set(toApply.map(t => t.key))
        s.state.blocked = [...s.state.blocked.filter(b => !appliedKeys.has(b.key)), ...blocked]
        const differ = await this.stillDifferent(s, scratch, target,
          toApply.filter(t => !errors.has(t.key) && !outcomes.get(t.key)?.notRestorable).map(t => ({ key: t.key, ...t.parts })))
        const now = new Date().toISOString()
        await writeState(this.aasHome, s.state)
        return {
          snapshot,
          applied,
          missingSecrets: missingSecrets(blocked),
          failed: [
            ...[...errors].map(([key, message]) => ({ ...ref(key), message, at: now })),
            ...[...differ].map(key => ({ ...ref(key), message: 'after restoring, this machine still differs from the snapshot', at: now })),
          ],
          notRestorable: toApply.filter(t => outcomes.get(t.key)?.notRestorable).map(t => ref(t.key)),
        }
      })
    })
  }

  async history(options: { limit?: number } = {}): Promise<BackupHistoryEntry[]> {
    return this.locked(async () => {
      const s = await this.session()
      const head = (await s.repo.resolve(s.repo.trackingRef(s.conn.branch))) ?? s.state.lastSync?.commit
      if (!head) return []
      const limit = Math.max(1, Math.min(options.limit ?? 20, 500))
      return (await s.repo.log(head, limit)).map(e => ({ commit: e.commit, device: e.author, at: e.at, subject: e.subject }))
    })
  }

  async disconnect(): Promise<void> {
    await this.locked(async () => {
      await rm(backupDir(this.aasHome), { recursive: true, force: true })
    })
  }
}
