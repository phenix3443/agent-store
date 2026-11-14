// The system `git`, run with an argument array and never through a shell. It brings
// SSH, the user's credential helpers and self-hosted remotes; the backup repository
// is bare and only touched through plumbing with temporary index files.
import { spawn } from 'child_process'

export interface GitCredentials {
  username: string
  password: string
}

export class GitError extends Error {
  constructor(readonly args: string[], readonly exitCode: number | null, readonly stderr: string) {
    super(`git ${args[0] ?? ''} failed: ${stderr.trim().split('\n').slice(-3).join(' ') || `exit ${exitCode}`}`)
    this.name = 'GitError'
  }
}

export class GitNotFoundError extends Error {
  readonly reason = 'git-missing'
  constructor() {
    super('git was not found on PATH; install Git to use backups')
    this.name = 'GitNotFoundError'
  }
}

export interface GitRunOptions {
  /** Extra environment, e.g. GIT_INDEX_FILE or the author. */
  env?: Record<string, string>
  input?: string | Uint8Array
  cwd?: string
  /** Only for fetch, push and ls-remote. */
  credentials?: GitCredentials
}

const BASE_CONFIG = [
  '-c', 'core.autocrlf=false',
  '-c', 'core.safecrlf=false',
  '-c', 'core.symlinks=true',
  '-c', 'core.quotepath=off',
  '-c', 'core.precomposeunicode=true',
  '-c', 'gc.auto=0',
]

// The helper prints what git asks for from the environment, so the token is never in argv
// or in a config file. The empty value first drops every helper the user configured.
const ENV_HELPER = '!f() { test "$1" = get && printf \'username=%s\\npassword=%s\\n\' "$AAS_GIT_USERNAME" "$AAS_GIT_PASSWORD"; }; f'

function gitBin(): string {
  return process.env['AS_GIT_BIN'] || 'git'
}

export async function runGit(gitDir: string | null, args: string[], options: GitRunOptions = {}): Promise<string> {
  const full = [...BASE_CONFIG]
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', ...options.env }
  if (options.credentials) {
    full.push('-c', 'credential.helper=', '-c', `credential.helper=${ENV_HELPER}`)
    env['AAS_GIT_USERNAME'] = options.credentials.username
    env['AAS_GIT_PASSWORD'] = options.credentials.password
  }
  if (gitDir) full.push(`--git-dir=${gitDir}`)
  full.push(...args)
  return new Promise((resolve, reject) => {
    const child = spawn(gitBin(), full, { cwd: options.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (d: Buffer) => out.push(d))
    child.stderr.on('data', (d: Buffer) => err.push(d))
    child.on('error', e => {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') reject(new GitNotFoundError())
      else reject(e)
    })
    child.on('close', code => {
      const stderr = Buffer.concat(err).toString('utf-8')
      if (code === 0) resolve(Buffer.concat(out).toString('utf-8'))
      else reject(new GitError(args, code, stderr))
    })
    if (options.input !== undefined) child.stdin.end(options.input)
    else child.stdin.end()
  })
}

/**
 * Splits `https://user:token@host/repo` into the URL to store and the credentials to
 * keep out of it. Other forms (SSH, scp-like, local paths) are returned as given.
 */
export function splitRemoteCredentials(remote: string): { remote: string; credentials?: GitCredentials } {
  if (!/^https?:\/\//i.test(remote)) return { remote }
  let url: URL
  try { url = new URL(remote) } catch { return { remote } }
  if (!url.password) return { remote }
  const credentials = { username: decodeURIComponent(url.username) || 'x-access-token', password: decodeURIComponent(url.password) }
  url.username = ''
  url.password = ''
  return { remote: url.toString(), credentials }
}
