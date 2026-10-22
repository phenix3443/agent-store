// Config-file writes that never make things worse: a file that does not parse
// aborts the write, writes are atomic (temp file + rename), and the previous
// content is copied to ~/.agents/agent-store/backups/<ts>/ first.
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'

export class ConfigParseError extends Error {
  constructor(readonly path: string, cause: string) {
    super(`${path} could not be parsed (${cause}); fix or move it first — nothing was written`)
    this.name = 'ConfigParseError'
  }
}

/** Parsed JSON object, `undefined` when the file does not exist; throws ConfigParseError otherwise. */
export async function readJsonObject(path: string): Promise<Record<string, unknown> | undefined> {
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw e
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new ConfigParseError(path, (e as Error).message)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigParseError(path, 'not a JSON object')
  }
  return parsed as Record<string, unknown>
}

/**
 * Writes via a temp file + rename. An existing file keeps its mode unless
 * `forceMode` is set (files that hold secrets stay 0600).
 */
export async function atomicWriteFile(path: string, data: string, mode = 0o644, forceMode = false): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  if (!forceMode) {
    try { mode = (await stat(path)).mode & 0o777 } catch { /* new file */ }
  }
  const tmp = `${path}.as-tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, data, { mode })
  await rename(tmp, path)
}

/** Copies `path` (if it exists) into the backups dir; returns the copy's path. */
export async function backupFile(aasHome: string, path: string): Promise<string | undefined> {
  try { await stat(path) } catch { return undefined }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(aasHome, 'agent-store', 'backups', stamp)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const dest = join(dir, basename(path))
  await copyFile(path, dest)
  return dest
}
