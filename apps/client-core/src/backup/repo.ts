// Operations on the bare backup repository, ~/.agent-store/backup/repo.git. Trees are
// built from and written to plain directories through throwaway index files, so the
// repository has no work tree that could drift from what was committed.
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { GitError, runGit, type GitCredentials } from './git'

export interface ItemIds {
  /** `content/` tree; absent when the item is not in the tree. */
  content?: string
  /** `state.json` blob. */
  state?: string
  /** Skills: false for a too-large placeholder, which has no `content/files`. */
  hasFiles: boolean
}

export interface Author {
  name: string
  email: string
}

const ITEM_PATH = /^items\/(skill|mcp|provider)\/([^/]+)\/(content|state\.json|content\/files)$/

export class BackupRepo {
  constructor(readonly gitDir: string, private readonly credentials?: GitCredentials) {}

  git(args: string[], options: { env?: Record<string, string>; input?: string; network?: boolean; cwd?: string } = {}): Promise<string> {
    return runGit(this.gitDir, args, {
      env: options.env, input: options.input, cwd: options.cwd, credentials: options.network ? this.credentials : undefined,
    })
  }

  static async init(gitDir: string, remote: string, branch: string, credentials?: GitCredentials): Promise<BackupRepo> {
    await runGit(null, ['init', '--bare', '-q', gitDir])
    const repo = new BackupRepo(gitDir, credentials)
    await repo.git(['remote', 'add', 'origin', remote])
    await repo.git(['symbolic-ref', 'HEAD', `refs/heads/${branch}`])
    return repo
  }

  /** The remote's default branch, or null for an empty repository. Also proves the remote is reachable. */
  static async remoteDefaultBranch(remote: string, credentials?: GitCredentials): Promise<string | null> {
    const out = await runGit(null, ['ls-remote', '--symref', remote, 'HEAD'], { credentials })
    const m = out.match(/^ref: refs\/heads\/(\S+)\tHEAD$/m)
    return m ? m[1] : null
  }

  private async withIndex<T>(fn: (env: Record<string, string>) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), 'as-backup-index-'))
    try {
      return await fn({ GIT_INDEX_FILE: join(dir, 'index') })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  /** The tree of everything under `dir`, ignore rules included (`-f`). */
  async writeTree(dir: string): Promise<string> {
    return this.withIndex(async env => {
      await this.git([`--work-tree=${dir}`, 'add', '-A', '-f'], { env, cwd: dir })
      return (await this.git(['write-tree'], { env })).trim()
    })
  }

  /** Writes `treeish` into the empty directory `dir`. */
  async materialize(treeish: string, dir: string): Promise<void> {
    await this.withIndex(async env => {
      await this.git(['read-tree', treeish], { env })
      await this.git([`--work-tree=${dir}`, 'checkout-index', '-a', '-f'], { env, cwd: dir })
    })
  }

  async items(treeish: string | null): Promise<Map<string, ItemIds>> {
    const items = new Map<string, ItemIds>()
    if (!treeish) return items
    const out = await this.git(['ls-tree', '-r', '-t', '-z', treeish, '--', 'items'])
    for (const record of out.split('\0')) {
      if (!record) continue
      const tab = record.indexOf('\t')
      const [, type, oid] = record.slice(0, tab).split(' ')
      const m = record.slice(tab + 1).match(ITEM_PATH)
      if (!m) continue
      const key = `${m[1]}/${m[2]}`
      const ids = items.get(key) ?? { hasFiles: false }
      if (m[3] === 'content' && type === 'tree') ids.content = oid
      else if (m[3] === 'state.json' && type === 'blob') ids.state = oid
      else if (m[3] === 'content/files' && type === 'tree') ids.hasFiles = true
      items.set(key, ids)
    }
    for (const [key, ids] of items) if (!ids.content) items.delete(key)
    return items
  }

  async readBlob(treeish: string, path: string): Promise<string | null> {
    try {
      return await this.git(['cat-file', 'blob', `${treeish}:${path}`])
    } catch (e) {
      if (e instanceof GitError) return null
      throw e
    }
  }

  async treeOf(commit: string): Promise<string> {
    return (await this.git(['rev-parse', `${commit}^{tree}`])).trim()
  }

  async resolve(ref: string): Promise<string | null> {
    try {
      return (await this.git(['rev-parse', '--verify', '-q', `${ref}^{commit}`])).trim() || null
    } catch (e) {
      if (e instanceof GitError) return null
      throw e
    }
  }

  async commit(tree: string, parents: string[], message: string, author: Author): Promise<string> {
    const env = {
      GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email,
      GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email,
    }
    const args = ['commit-tree', '--no-gpg-sign', ...parents.flatMap(p => ['-p', p]), tree]
    return (await this.git(args, { env, input: message })).trim()
  }

  async setRef(ref: string, commit: string): Promise<void> {
    await this.git(['update-ref', ref, commit])
  }

  async deleteRef(ref: string): Promise<void> {
    await this.git(['update-ref', '-d', ref])
  }

  trackingRef(branch: string): string {
    return `refs/remotes/origin/${branch}`
  }

  /** Fetches `branch` and returns its commit, or null when the remote does not have it. */
  async fetch(branch: string): Promise<string | null> {
    try {
      await this.git(['fetch', '--no-tags', '-q', 'origin', `+refs/heads/${branch}:${this.trackingRef(branch)}`], { network: true })
    } catch (e) {
      if (e instanceof GitError && /couldn't find remote ref|could not find remote ref/i.test(e.stderr)) {
        if (await this.resolve(this.trackingRef(branch))) await this.deleteRef(this.trackingRef(branch))
        return null
      }
      throw e
    }
    return this.resolve(this.trackingRef(branch))
  }

  /** False when the remote moved on in the meantime (non-fast-forward). */
  async push(commit: string, branch: string): Promise<boolean> {
    try {
      await this.git(['push', '-q', 'origin', `${commit}:refs/heads/${branch}`], { network: true })
    } catch (e) {
      if (e instanceof GitError && /\[rejected\]|non-fast-forward|fetch first|stale info/i.test(e.stderr)) return false
      throw e
    }
    await this.setRef(this.trackingRef(branch), commit)
    return true
  }

  async isAncestor(ancestor: string, commit: string): Promise<boolean> {
    try {
      await this.git(['merge-base', '--is-ancestor', ancestor, commit])
      return true
    } catch (e) {
      if (e instanceof GitError && e.exitCode === 1) return false
      throw e
    }
  }

  async countBetween(from: string | null, to: string): Promise<number> {
    return Number((await this.git(['rev-list', '--count', from ? `${from}..${to}` : to])).trim())
  }

  async lastAuthor(rev: string, path: string): Promise<string | undefined> {
    const out = (await this.git(['log', '-1', '--format=%an', rev, '--', path])).trim()
    return out || undefined
  }

  async log(rev: string, limit: number): Promise<Array<{ commit: string; author: string; at: string; subject: string }>> {
    const out = await this.git(['log', `-n${limit}`, '--format=%H%x00%an%x00%aI%x00%s', rev])
    return out.split('\n').filter(Boolean).map(line => {
      const [commit, author, at, subject] = line.split('\0')
      return { commit, author, at, subject }
    })
  }

  async refs(prefix: string): Promise<Array<{ ref: string; commit: string; subject: string; at: string }>> {
    const out = await this.git(['for-each-ref', '--sort=-creatordate', '--format=%(refname)%00%(objectname)%00%(subject)%00%(creatordate:iso-strict)', prefix])
    return out.split('\n').filter(Boolean).map(line => {
      const [ref, commit, subject, at] = line.split('\0')
      return { ref, commit, subject, at }
    })
  }
}
