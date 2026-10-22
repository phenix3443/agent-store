// Each tool's own view of what it loaded, read without a model call:
//   Claude Code: the `system/init` event of `claude -p --output-format stream-json`
//                (emitted before the first API request, so an invalid key is fine).
//   Codex:       `codex app-server` JSON-RPC `skills/list` and `mcpServerStatus/list`.
import { createInterface } from 'readline'
import { DEFAULT_TIMEOUT_MS, killGroup, spawnGroup } from './proc'

export interface ClaudeView {
  ok: true
  skills: string[]
  mcpServers: Array<{ name: string; status: string }>
  tools: string[]
  version?: string
}

export interface CodexSkill { name: string; path: string; scope: string; enabled: boolean }
export interface CodexMcpServer { name: string; tools: string[]; toolsError?: string | null }

export interface CodexView {
  ok: true
  skills: CodexSkill[]
  mcpServers: CodexMcpServer[]
}

export interface ViewError { ok: false; error: string; timedOut: boolean; ms: number }

interface ViewOptions {
  env: Record<string, string>
  cwd: string
  timeoutMs?: number
  bin?: string
}

export function claudeView(opts: ViewOptions): Promise<ClaudeView | ViewError> {
  const started = Date.now()
  const cmd = [opts.bin ?? 'claude', '-p', 'ping', '--output-format', 'stream-json', '--verbose', '--max-turns', '1']
  return new Promise(resolve => {
    const child = spawnGroup(cmd, opts)
    child.stdin!.end()
    let stderr = ''
    let done = false
    const finish = (v: ClaudeView | ViewError) => {
      if (done) return
      done = true
      clearTimeout(timer)
      killGroup(child)
      resolve(v)
    }
    const timer = setTimeout(
      () => finish({ ok: false, error: `no init event within ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`, timedOut: true, ms: Date.now() - started }),
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    )
    child.stderr!.on('data', d => { stderr += d })
    createInterface({ input: child.stdout! }).on('line', line => {
      let ev: Record<string, unknown>
      try { ev = JSON.parse(line) as Record<string, unknown> } catch { return }
      if (ev['type'] !== 'system' || ev['subtype'] !== 'init') return
      finish({
        ok: true,
        skills: (ev['skills'] as string[] | undefined) ?? [],
        mcpServers: (ev['mcp_servers'] as Array<{ name: string; status: string }> | undefined) ?? [],
        tools: (ev['tools'] as string[] | undefined) ?? [],
        version: ev['claude_code_version'] as string | undefined,
      })
    })
    child.on('error', err => finish({ ok: false, error: String(err), timedOut: false, ms: Date.now() - started }))
    child.on('close', code =>
      finish({ ok: false, error: `claude exited ${code} before init: ${stderr.trim().slice(0, 300)}`, timedOut: false, ms: Date.now() - started })
    )
  })
}

export function codexView(opts: ViewOptions): Promise<CodexView | ViewError> {
  const started = Date.now()
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise(resolve => {
    const child = spawnGroup([opts.bin ?? 'codex', 'app-server'], opts)
    let stderr = ''
    let done = false
    const pending = new Map<number, (msg: Record<string, unknown>) => void>()
    let nextId = 0
    const finish = (v: CodexView | ViewError) => {
      if (done) return
      done = true
      clearTimeout(timer)
      killGroup(child)
      resolve(v)
    }
    const fail = (error: string, timedOut = false) => finish({ ok: false, error, timedOut, ms: Date.now() - started })
    const timer = setTimeout(() => fail(`no app-server answer within ${timeoutMs}ms`, true), timeoutMs)
    child.stderr!.on('data', d => { stderr += d })
    child.stdin!.on('error', () => { /* reported via close */ })
    child.on('error', err => fail(String(err)))
    child.on('close', code => fail(`codex app-server exited ${code}: ${stderr.trim().slice(0, 300)}`))
    createInterface({ input: child.stdout! }).on('line', line => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(line) as Record<string, unknown> } catch { return }
      const id = msg['id']
      if (typeof id === 'number' && pending.has(id)) {
        pending.get(id)!(msg)
        pending.delete(id)
      }
    })
    const send = (msg: Record<string, unknown>) => child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n')
    const request = (method: string, params: unknown) =>
      new Promise<Record<string, unknown>>((res, rej) => {
        const id = ++nextId
        pending.set(id, msg => (msg['error'] ? rej(new Error(`${method}: ${JSON.stringify(msg['error'])}`)) : res(msg['result'] as Record<string, unknown>)))
        send({ id, method, params })
      })

    ;(async () => {
      await request('initialize', { clientInfo: { name: 'agent-store-accept', version: '1' } })
      send({ method: 'initialized' })
      const skillsRes = await request('skills/list', { cwds: [opts.cwd], forceReload: true })
      const skills: CodexSkill[] = []
      for (const entry of (skillsRes['data'] as Array<{ skills: CodexSkill[] }>) ?? []) {
        for (const s of entry.skills ?? []) skills.push({ name: s.name, path: s.path, scope: s.scope, enabled: s.enabled })
      }
      const mcpServers: CodexMcpServer[] = []
      let cursor: string | null = null
      do {
        const page: Record<string, unknown> = await request('mcpServerStatus/list', cursor ? { cursor } : {})
        for (const s of (page['data'] as Array<{ name: string; tools?: Record<string, unknown>; toolsError?: string | null }>) ?? []) {
          mcpServers.push({ name: s.name, tools: Object.keys(s.tools ?? {}), toolsError: s.toolsError ?? null })
        }
        cursor = (page['nextCursor'] as string | null) ?? null
      } while (cursor)
      finish({ ok: true, skills, mcpServers })
    })().catch(err => fail(String(err)))
  })
}
