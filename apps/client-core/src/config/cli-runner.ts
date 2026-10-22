// Runs a tool's own CLI (claude / codex) with a time bound.
import { spawn } from 'child_process'
import { accessSync, constants } from 'fs'
import { delimiter, join } from 'path'

export interface CliResult { code: number | null; stdout: string; stderr: string; timedOut: boolean }

export const CLI_TIMEOUT_MS = 60_000

/**
 * Path of a tool binary. `envVar` overrides the PATH lookup; set it to an
 * empty string to act as if the tool is not installed.
 */
export function findBinary(name: string, envVar: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const override = env[envVar]
  if (override !== undefined) return override === '' ? undefined : override
  for (const dir of (env['PATH'] ?? '').split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, name)
    try { accessSync(candidate, constants.X_OK); return candidate } catch { /* keep looking */ }
  }
  return undefined
}

export function runCli(bin: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs = CLI_TIMEOUT_MS): Promise<CliResult> {
  return new Promise(resolve => {
    const child = spawn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs)
    child.on('error', err => { clearTimeout(timer); resolve({ code: 127, stdout, stderr: stderr + String(err), timedOut }) })
    child.on('close', code => { clearTimeout(timer); resolve({ code: timedOut ? null : code, stdout, stderr, timedOut }) })
  })
}

export function describeFailure(what: string, r: CliResult): string {
  const out = `${r.stderr}\n${r.stdout}`.trim().split('\n').slice(-3).join(' ')
  return `${what} ${r.timedOut ? 'timed out' : `exited ${r.code}`}${out ? `: ${out}` : ''}`
}
