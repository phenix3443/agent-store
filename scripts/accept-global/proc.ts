// Child processes with a hard time bound. Each child runs in its own process
// group so a timeout also kills what it started (MCP servers, app-server).
import { spawn, type ChildProcess } from 'child_process'

export const DEFAULT_TIMEOUT_MS = 90_000

export interface RunResult {
  cmd: string[]
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  ms: number
}

export interface RunOptions {
  env: Record<string, string>
  cwd: string
  timeoutMs?: number
  stdin?: string
}

export function killGroup(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return
  try { process.kill(-child.pid, 'SIGKILL') } catch { /* already gone */ }
}

export function spawnGroup(cmd: string[], opts: RunOptions): ChildProcess {
  return spawn(cmd[0], cmd.slice(1), {
    cwd: opts.cwd,
    env: opts.env,
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

export function run(cmd: string[], opts: RunOptions): Promise<RunResult> {
  const started = Date.now()
  return new Promise(resolve => {
    const child = spawnGroup(cmd, opts)
    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout!.on('data', d => { stdout += d })
    child.stderr!.on('data', d => { stderr += d })
    child.stdin!.on('error', () => { /* child exited before reading */ })
    child.stdin!.end(opts.stdin ?? '')
    const timer = setTimeout(() => { timedOut = true; killGroup(child) }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    const finish = (code: number | null) => {
      clearTimeout(timer)
      killGroup(child)
      resolve({ cmd, code: timedOut ? null : code, stdout, stderr, timedOut, ms: Date.now() - started })
    }
    child.on('error', err => { stderr += String(err); finish(127) })
    child.on('close', code => finish(code))
  })
}

/** One line for reports: the command, exit code and a trimmed output excerpt. */
export function excerpt(r: RunResult, max = 300): string {
  const text = `${r.stdout}\n${r.stderr}`.replace(/\s+/g, ' ').trim()
  const code = r.timedOut ? `timeout after ${r.ms}ms` : `exit ${r.code}`
  return `${code}${text ? `: ${text.slice(0, max)}` : ''}`
}
