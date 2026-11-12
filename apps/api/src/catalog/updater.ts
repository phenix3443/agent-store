import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { checkCatalogFile, type CatalogReader } from './reader'

export interface CatalogUpdaterOptions {
  reader: CatalogReader
  /** Where the published catalog.db is downloaded from; a path ending in .gz is gunzipped. */
  url: string
  /** Local copy that is served; replaced atomically on each new version. */
  path: string
  fetch?: typeof fetch
  timeoutMs?: number
  log?: (entry: Record<string, unknown>) => void
}

interface Validators {
  etag: string | null
  lastModified: string | null
}

export type CheckResult = 'updated' | 'unchanged' | 'failed'

export class CatalogUpdater {
  private running: Promise<CheckResult> | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly o: CatalogUpdaterOptions) {}

  private get validatorsPath() {
    return `${this.o.path}.http.json`
  }

  private readValidators(): Validators {
    try {
      return JSON.parse(readFileSync(this.validatorsPath, 'utf-8')) as Validators
    } catch {
      return { etag: null, lastModified: null }
    }
  }

  private log(entry: Record<string, unknown>) {
    ;(this.o.log ?? ((e) => console.log(JSON.stringify(e))))(entry)
  }

  /** Serves the local copy left by an earlier run, if it is still valid. */
  openLocal(): boolean {
    if (!existsSync(this.o.path)) return false
    try {
      checkCatalogFile(this.o.path)
      this.o.reader.open(this.o.path)
      return true
    } catch (e) {
      this.log({ level: 'warn', message: 'local catalog unusable', error: String(e) })
      return false
    }
  }

  /** Downloads a newer catalog if there is one; on any failure the current one stays. */
  check(): Promise<CheckResult> {
    this.running ??= this.download().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async download(): Promise<CheckResult> {
    const fetchImpl = this.o.fetch ?? fetch
    const tmp = `${this.o.path}.download-${process.pid}-${Date.now()}`
    try {
      const v = this.o.reader.ready ? this.readValidators() : { etag: null, lastModified: null }
      const headers: Record<string, string> = { 'user-agent': 'agent-store-api' }
      if (v.etag) headers['if-none-match'] = v.etag
      if (v.lastModified) headers['if-modified-since'] = v.lastModified
      const res = await fetchImpl(this.o.url, { headers, signal: AbortSignal.timeout(this.o.timeoutMs ?? 120_000) })
      if (res.status === 304) return 'unchanged'
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      mkdirSync(dirname(this.o.path), { recursive: true })
      if (!res.body) throw new Error('empty response body')
      const body = Readable.fromWeb(res.body as unknown as WebReadableStream)
      // Streamed: the file (unpacked, for a .gz URL) need not fit in memory.
      if (new URL(this.o.url).pathname.endsWith('.gz')) await pipeline(body, createGunzip(), createWriteStream(tmp))
      else await pipeline(body, createWriteStream(tmp))
      const { resources } = checkCatalogFile(tmp)
      renameSync(tmp, this.o.path)
      this.o.reader.open(this.o.path)
      writeFileSync(this.validatorsPath, JSON.stringify({ etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') }))
      this.log({ level: 'info', message: 'catalog updated', resources, etag: res.headers.get('etag') })
      return 'updated'
    } catch (e) {
      rmSync(tmp, { force: true })
      this.log({ level: 'warn', message: 'catalog update failed; keeping the current one', error: e instanceof Error ? e.message : String(e) })
      return 'failed'
    }
  }

  start(intervalMs: number): void {
    this.openLocal()
    void this.check()
    this.timer = setInterval(() => void this.check(), intervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
