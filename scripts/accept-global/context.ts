// Shared state for one harness run and the helpers every case uses.
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from 'fs'
import { join } from 'path'
import type { ProbeStore } from '../../test/accept/probes'
import { run, type RunResult } from './proc'
import { claudeView, codexView, type ClaudeView, type CodexView, type ViewError } from './recognize'
import type { Reporter } from './report'
import { isolatedRoots, skillsDirs, toolEnv, type Roots } from './roots'

export interface Ctx {
  mode: 'isolated' | 'real'
  rep: Reporter
  store: ProbeStore
  /** The `as` CLI command prefix, e.g. ['bun', '<repo>/apps/cli/src/index.ts']. */
  asCmd: string[]
  timeoutMs: number
  /** Isolated: parent of every per-case root. */
  base: string
  /** Real: the single target. */
  real?: Roots
}

export function newRoots(ctx: Ctx, name: string): Roots {
  if (ctx.mode === 'real') return ctx.real!
  const r = isolatedRoots(ctx.base, name)
  for (const dir of [r.home, r.claudeConfigDir, r.codexHome, r.cwd]) mkdirSync(dir, { recursive: true })
  return r
}

export function storeEnv(ctx: Ctx, storeUrl = ctx.store.url): Record<string, string> {
  return {
    AS_STORE_URL: storeUrl,
    AS_GITHUB_API_URL: ctx.store.githubApiUrl,
    AS_CODELOAD_URL: ctx.store.codeloadUrl,
  }
}

export function as(
  ctx: Ctx,
  r: Roots,
  args: string[],
  opts: { stdin?: string; storeUrl?: string } = {}
): Promise<RunResult> {
  return run([...ctx.asCmd, ...args], {
    env: toolEnv(r, ctx.mode, storeEnv(ctx, opts.storeUrl)),
    cwd: r.cwd,
    timeoutMs: ctx.timeoutMs,
    stdin: opts.stdin,
  })
}

export interface Views {
  claude: ClaudeView | ViewError
  codex: CodexView | ViewError
}

/** Both tools' view, each from a fresh process (the "restart" of §5.4). */
export async function views(ctx: Ctx, r: Roots, extraEnv: Record<string, string | undefined> = {}): Promise<Views> {
  // An invalid key keeps the recognition step from ever reaching a model.
  const claudeEnv = toolEnv(r, ctx.mode, {
    ANTHROPIC_API_KEY: 'invalid',
    ANTHROPIC_AUTH_TOKEN: undefined,
    ANTHROPIC_BASE_URL: undefined,
    ...extraEnv,
  })
  const codexEnv = toolEnv(r, ctx.mode, extraEnv)
  const [claude, codex] = await Promise.all([
    claudeView({ env: claudeEnv, cwd: r.cwd, timeoutMs: ctx.timeoutMs }),
    codexView({ env: codexEnv, cwd: r.cwd, timeoutMs: ctx.timeoutMs }),
  ])
  return { claude, codex }
}

export function viewError(v: ClaudeView | CodexView | ViewError): string | undefined {
  return v.ok ? undefined : `${v.timedOut ? 'TIMEOUT ' : ''}${v.error}`
}

export const claudeHasSkill = (v: Views, name: string) => v.claude.ok && v.claude.skills.includes(name)

export function claudeMcpStatus(v: Views, server: string): string | undefined {
  return v.claude.ok ? v.claude.mcpServers.find(s => s.name === server)?.status : undefined
}

export const claudeHasTool = (v: Views, tool: string) => v.claude.ok && v.claude.tools.includes(tool)

function real(path: string): string {
  try { return realpathSync(path) } catch { return path }
}

/**
 * Codex sees the skill exactly once, under `name`, with a path that resolves
 * into `dir` (our directory), and as a user skill.
 */
export function codexSkillCheck(v: Views, name: string, dir: string): { ok: boolean; detail: string } {
  if (!v.codex.ok) return { ok: false, detail: viewError(v.codex)! }
  const matches = v.codex.skills.filter(s => s.name === name)
  const root = real(dir)
  const ours = matches.filter(s => real(s.path).startsWith(`${root}/`))
  const ok = matches.length === 1 && ours.length === 1 && ours[0].scope === 'user'
  return { ok, detail: `${matches.length} entr${matches.length === 1 ? 'y' : 'ies'} named ${name}: ${matches.map(s => `${s.scope}:${s.path}`).join(', ') || 'none'}` }
}

export const codexListsSkill = (v: Views, name: string) => v.codex.ok && v.codex.skills.some(s => s.name === name)

export function codexMcpTools(v: Views, server: string): string[] | undefined {
  return v.codex.ok ? v.codex.mcpServers.find(s => s.name === server)?.tools : undefined
}

export function skillPaths(r: Roots, slug: string) {
  const dirs = skillsDirs(r)
  return { agents: join(dirs.agents, slug), claude: join(dirs.claude, slug), codex: join(dirs.codex, slug) }
}

export function isSymlinkTo(path: string, target: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink() && real(path) === real(target)
  } catch {
    return false
  }
}

export function exists(path: string): boolean {
  try { lstatSync(path); return true } catch { return false }
}

export function readText(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf-8') : undefined
}
