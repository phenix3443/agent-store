// Extracts one directory of a codeload tarball without trusting it: absolute
// entries, `..`, links that leave the directory, special files and anything
// over the size limit are rejected before a single file is written.
import { gunzipSync } from 'zlib'
import { mkdir, symlink, writeFile } from 'fs/promises'
import { dirname, join, posix } from 'path'

export const MAX_SKILL_BYTES = 20 * 1024 * 1024
/** The limit applies to the skill directory; the repo tarball around it may be larger. */
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
const MAX_TAR_BYTES = 512 * 1024 * 1024

export class UnsafeArchiveError extends Error {
  constructor(message: string) {
    super(`unsafe skill archive: ${message}`)
    this.name = 'UnsafeArchiveError'
  }
}

export interface TarEntry {
  /** Path inside the archive, `/`-separated, no leading `./`. */
  path: string
  type: 'file' | 'dir' | 'symlink' | 'other'
  mode: number
  linkname: string
  data: Uint8Array
}

function cstr(buf: Uint8Array, start: number, len: number): string {
  let end = start
  while (end < start + len && buf[end] !== 0) end++
  return Buffer.from(buf.subarray(start, end)).toString('utf-8')
}

function octal(buf: Uint8Array, start: number, len: number): number {
  const s = cstr(buf, start, len).trim()
  if (!s) return 0
  if (!/^[0-7]+$/.test(s)) throw new UnsafeArchiveError(`unsupported numeric field ${JSON.stringify(s)}`)
  return parseInt(s, 8)
}

function paxRecords(data: Uint8Array): Record<string, string> {
  // Record lengths count bytes, so slice the bytes before decoding.
  const out: Record<string, string> = {}
  const buf = Buffer.from(data)
  let i = 0
  while (i < buf.length) {
    const space = buf.indexOf(0x20, i)
    if (space === -1) break
    const len = parseInt(buf.subarray(i, space).toString('ascii'), 10)
    if (!len || i + len > buf.length) throw new UnsafeArchiveError('malformed pax header')
    const record = buf.subarray(space + 1, i + len - 1).toString('utf-8')
    const eq = record.indexOf('=')
    if (eq !== -1) out[record.slice(0, eq)] = record.slice(eq + 1)
    i += len
  }
  return out
}

/** Parses an uncompressed ustar/pax/GNU tar stream. */
export function parseTar(tar: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = []
  let offset = 0
  let pax: Record<string, string> = {}
  let longName: string | undefined
  let longLink: string | undefined
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every(b => b === 0)) break
    const size = octal(header, 124, 12)
    const flag = String.fromCharCode(header[156] || 0x30)
    if (offset + 512 + size > tar.length) throw new UnsafeArchiveError('truncated archive')
    const data = tar.subarray(offset + 512, offset + 512 + size)
    offset += 512 + Math.ceil(size / 512) * 512
    if (flag === 'x') { pax = paxRecords(data); continue }
    if (flag === 'g') continue
    if (flag === 'L') { longName = cstr(data, 0, data.length); continue }
    if (flag === 'K') { longLink = cstr(data, 0, data.length); continue }
    const prefix = cstr(header, 345, 155)
    const name = pax['path'] ?? longName ?? (prefix ? `${prefix}/${cstr(header, 0, 100)}` : cstr(header, 0, 100))
    const linkname = pax['linkpath'] ?? longLink ?? cstr(header, 157, 100)
    pax = {}; longName = undefined; longLink = undefined
    const type = flag === '0' || flag === '7' ? 'file'
      : flag === '5' ? 'dir'
      : flag === '2' ? 'symlink'
      : 'other'
    entries.push({ path: name.replace(/^\.\//, ''), type, mode: octal(header, 100, 8), linkname, data })
  }
  return entries
}

/**
 * Writes the entries under `<top>/<dir>/` of a gzipped codeload tarball into
 * `dest`. `dir` is repo-relative (`''` = repo root). Returns the files written.
 */
export async function extractSkillDir(gz: Uint8Array, dir: string, dest: string): Promise<string[]> {
  if (gz.length > MAX_ARCHIVE_BYTES) throw new UnsafeArchiveError(`archive is over ${MAX_ARCHIVE_BYTES} bytes`)
  let raw: Uint8Array
  try {
    raw = gunzipSync(gz, { maxOutputLength: MAX_TAR_BYTES })
  } catch (e) {
    throw new UnsafeArchiveError(`not a readable tar.gz (${(e as Error).message})`)
  }
  const entries = parseTar(raw)
  const want = dir.replace(/^\/+|\/+$/g, '')
  const picked: Array<{ rel: string; entry: TarEntry }> = []
  let total = 0
  for (const entry of entries) {
    if (entry.path.startsWith('/') || entry.path.includes('\\')) throw new UnsafeArchiveError(`absolute or backslash path ${entry.path}`)
    const parts = entry.path.split('/').filter(Boolean)
    if (parts.includes('..')) throw new UnsafeArchiveError(`path with .. ${entry.path}`)
    // codeload wraps everything in one top-level `<name>-<sha>/` directory.
    const inRepo = parts.slice(1).join('/')
    const rel = want === '' ? inRepo : inRepo === want ? '' : inRepo.startsWith(`${want}/`) ? inRepo.slice(want.length + 1) : undefined
    if (rel === undefined || rel === '') continue
    if (entry.type === 'other') throw new UnsafeArchiveError(`unsupported entry type for ${entry.path}`)
    total += entry.data.length
    if (total > MAX_SKILL_BYTES) throw new UnsafeArchiveError(`skill content is over ${MAX_SKILL_BYTES} bytes`)
    picked.push({ rel, entry })
  }

  // Links are checked lexically, so nothing may be reached *through* a link:
  // no entry below one, and no link target that passes one or uses `..` after a
  // name (`l -> .` plus `l2 -> l/..` would otherwise leave the directory).
  const links = new Set(picked.filter(p => p.entry.type === 'symlink').map(p => p.rel))
  const throughLink = (path: string) => {
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) if (links.has(parts.slice(0, i).join('/'))) return true
    return false
  }
  for (const { rel, entry } of picked) {
    if (throughLink(rel)) throw new UnsafeArchiveError(`${entry.path} is below a symlink`)
    if (entry.type !== 'symlink') continue
    const target = entry.linkname
    const segs = target.split('/').filter(s => s && s !== '.')
    const firstName = segs.findIndex(s => s !== '..')
    const resolved = posix.normalize(posix.join(posix.dirname(rel), target))
    if (target.startsWith('/') || target.includes('\\') || resolved === '..' || resolved.startsWith('../') ||
        (firstName !== -1 && segs.slice(firstName).includes('..')) || links.has(resolved) || throughLink(resolved)) {
      throw new UnsafeArchiveError(`symlink ${entry.path} points outside the skill directory or through another link (${target})`)
    }
  }

  const written: string[] = []
  for (const { rel, entry } of picked) {
    const out = join(dest, rel)
    if (entry.type === 'dir') { await mkdir(out, { recursive: true }); continue }
    await mkdir(dirname(out), { recursive: true })
    if (entry.type === 'symlink') await symlink(entry.linkname, out)
    else await writeFile(out, entry.data, { mode: (entry.mode & 0o111) ? 0o755 : 0o644 })
    written.push(rel)
  }
  return written
}
