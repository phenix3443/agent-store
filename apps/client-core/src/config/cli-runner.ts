// Runs a tool's own CLI (claude / codex) with a time bound.
import { spawn } from 'child_process'
import { accessSync, constants, readFileSync, statSync } from 'fs'
import { dirname, extname, join, resolve } from 'path'
import readCmdShim from 'read-cmd-shim'

export interface CliResult { code: number | null; stdout: string; stderr: string; timedOut: boolean }

/** A program and the arguments that come before the CLI's own (a JS entry run by node). */
export interface CliCommand { command: string; args: string[] }

export type CliLookup =
  | { kind: 'found'; cli: CliCommand; via: 'override' | 'path' | 'shim-exe' | 'shim-node' }
  | { kind: 'missing' }
  /** Only a .cmd/.bat shim was found and it points at nothing we can start without cmd.exe. */
  | { kind: 'unrunnable'; shim: string; reason: string }

export const CLI_TIMEOUT_MS = 60_000

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'
const DIRECT_EXTS = new Set(['.exe', '.com'])
const SHIM_EXTS = new Set(['.cmd', '.bat'])
const JS_EXTS = new Set(['.js', '.cjs', '.mjs'])

function isFile(path: string): boolean {
  try { return statSync(path).isFile() } catch { return false }
}

/** Windows environment names are case-insensitive, but a copied env object is not. */
function envValue(env: NodeJS.ProcessEnv, key: string, platform: NodeJS.Platform): string | undefined {
  if (platform !== 'win32') return env[key]
  const found = Object.keys(env).find(k => k.toUpperCase() === key)
  return found === undefined ? undefined : env[found]
}

function pathDirs(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const delimiter = platform === 'win32' ? ';' : ':'
  return (envValue(env, 'PATH', platform) ?? '').split(delimiter)
    .map(d => (/^".*"$/.test(d) ? d.slice(1, -1) : d))
    .filter(Boolean)
}

/** Every `<dir>\<name><ext>` file on PATH, in PATH order and PATHEXT order within a directory. */
function windowsCandidates(name: string, env: NodeJS.ProcessEnv): string[] {
  const exts = (envValue(env, 'PATHEXT', 'win32') || DEFAULT_PATHEXT).split(';').map(e => e.trim()).filter(Boolean)
  const found: string[] = []
  for (const dir of pathDirs(env, 'win32')) {
    for (const ext of exts) {
      // Windows matches either spelling; trying both keeps the lookup testable on a case-sensitive file system.
      const hit = [name + ext.toLowerCase(), name + ext].map(f => join(dir, f)).find(isFile)
      if (hit) found.push(hit)
    }
  }
  return found
}

const firstDirect = (paths: string[]) => paths.find(p => DIRECT_EXTS.has(extname(p).toLowerCase()))

/**
 * What an npm cmd-shim runs, without going through cmd.exe: the .exe it points at,
 * or node with the JS entry it points at. A string is the reason it can't be run.
 */
export function resolveCmdShim(shim: string, env: NodeJS.ProcessEnv): CliCommand | string {
  let rel: string
  let text: string
  try {
    text = readFileSync(shim, 'utf-8')
    // read-cmd-shim picks its parser by the extension and only knows lower-case `.cmd`.
    rel = readCmdShim.sync(shim.slice(0, -4) + shim.slice(-4).toLowerCase())
  } catch {
    return 'not an npm shim Agent Store can read'
  }
  const target = resolve(dirname(shim), ...rel.split(/[\\/]/))
  if (!isFile(target)) return `it points at ${target}, which does not exist`
  const ext = extname(target).toLowerCase()
  if (DIRECT_EXTS.has(ext)) return { command: target, args: [] }
  // The shim names its interpreter as `IF EXIST "%dp0%\<prog>.exe"`; only node is run here.
  if (JS_EXTS.has(ext) && /"%dp0%\\node\.exe"/i.test(text)) {
    const localNode = join(dirname(shim), 'node.exe')
    const node = isFile(localNode) ? localNode : firstDirect(windowsCandidates('node', env))
    if (!node) return `it runs ${target} with node, and node.exe is not on PATH`
    return { command: node, args: [target] }
  }
  return `it runs ${target} with a program Agent Store does not start directly`
}

function fromWindowsFile(path: string, env: NodeJS.ProcessEnv, via: 'override' | 'path'): CliLookup {
  if (!SHIM_EXTS.has(extname(path).toLowerCase())) return { kind: 'found', cli: { command: path, args: [] }, via }
  const shim = resolveCmdShim(path, env)
  if (typeof shim === 'string') return { kind: 'unrunnable', shim: path, reason: shim }
  return { kind: 'found', cli: shim, via: shim.args.length ? 'shim-node' : 'shim-exe' }
}

/**
 * Finds a tool's CLI. `envVar` overrides the PATH lookup; set it to an empty
 * string to act as if the tool is not installed.
 *
 * On Windows the result is never a .cmd/.bat file: the runtime refuses to pass
 * arguments containing `"` to a batch file (CVE-2024-27980), and running one
 * through `shell: true` would hand our JSON to cmd.exe to parse.
 */
export function findCli(name: string, envVar: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): CliLookup {
  const override = env[envVar]
  if (override !== undefined) {
    if (override === '') return { kind: 'missing' }
    return platform === 'win32' ? fromWindowsFile(override, env, 'override') : { kind: 'found', cli: { command: override, args: [] }, via: 'override' }
  }
  if (platform !== 'win32') {
    for (const dir of pathDirs(env, platform)) {
      const candidate = join(dir, name)
      try { accessSync(candidate, constants.X_OK); return { kind: 'found', cli: { command: candidate, args: [] }, via: 'path' } } catch { /* keep looking */ }
    }
    return { kind: 'missing' }
  }
  const candidates = windowsCandidates(name, env)
  const direct = firstDirect(candidates)
  if (direct) return { kind: 'found', cli: { command: direct, args: [] }, via: 'path' }
  let first: CliLookup | undefined
  for (const shim of candidates.filter(p => SHIM_EXTS.has(extname(p).toLowerCase()))) {
    const r = fromWindowsFile(shim, env, 'path')
    if (r.kind === 'found') return r
    first ??= r
  }
  return first ?? { kind: 'missing' }
}

/** What to tell the user when the tool is installed but its config was written without its CLI. */
export function cliFallbackNote(tool: string, configFile: string, lookup: CliLookup): string | undefined {
  if (lookup.kind !== 'unrunnable') return undefined
  return `${tool} at ${lookup.shim} can't be run safely (${lookup.reason}), so Agent Store edited ${configFile} directly`
}

export function runCli(cli: CliCommand, args: string[], env: NodeJS.ProcessEnv, timeoutMs = CLI_TIMEOUT_MS): Promise<CliResult> {
  return new Promise(resolve => {
    const child = spawn(cli.command, [...cli.args, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
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
