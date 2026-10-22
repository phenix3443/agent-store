// The set of directories one run targets, and the environment each child gets.
import { mkdtempSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join, resolve } from 'path'

export interface Roots {
  home: string
  /** Value for CLAUDE_CONFIG_DIR, or undefined when the tool default (~/.claude) applies. */
  claudeConfigDirEnv?: string
  claudeConfigDir: string
  claudeJson: string
  codexHome: string
  asHome: string
  /** Working directory for tool runs, so no project-level config is picked up. */
  cwd: string
}

export function isolatedRoots(base: string, name: string): Roots {
  const root = mkdtempSync(join(base, `${name}-`))
  const home = join(root, 'home')
  const claudeConfigDir = join(root, 'claude')
  return {
    home,
    claudeConfigDirEnv: claudeConfigDir,
    claudeConfigDir,
    claudeJson: join(claudeConfigDir, '.claude.json'),
    codexHome: join(root, 'codex'),
    asHome: join(home, '.agents'),
    cwd: join(root, 'cwd'),
  }
}

/** The invoking user's real directories, resolved the way each tool resolves them. */
export function realRoots(env: NodeJS.ProcessEnv, cwd: string): Roots {
  const home = env['HOME'] ?? homedir()
  const claudeConfigDirEnv = env['CLAUDE_CONFIG_DIR'] || undefined
  const claudeConfigDir = claudeConfigDirEnv ?? join(home, '.claude')
  return {
    home,
    claudeConfigDirEnv,
    claudeConfigDir,
    claudeJson: join(claudeConfigDirEnv ?? home, '.claude.json'),
    codexHome: env['CODEX_HOME'] || join(home, '.codex'),
    asHome: env['AS_HOME'] || join(home, '.agents'),
    cwd,
  }
}

export const skillsDirs = (r: Roots) => ({
  agents: join(r.asHome, 'skills'),
  claude: join(r.claudeConfigDir, 'skills'),
  codex: join(r.codexHome, 'skills'),
})

// Session variables of an enclosing Claude Code / Codex / Paperclip run that
// would point a child at the wrong config or account.
const ISOLATED_STRIP = /^(CLAUDE|CLAUDECODE$|ANTHROPIC_|CODEX_|OPENAI_|AS_|PAPERCLIP_)/

export function toolEnv(
  r: Roots,
  mode: 'isolated' | 'real',
  extra: Record<string, string | undefined> = {}
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    if (mode === 'isolated' && ISOLATED_STRIP.test(k)) continue
    env[k] = v
  }
  env['HOME'] = r.home
  if (r.claudeConfigDirEnv) env['CLAUDE_CONFIG_DIR'] = r.claudeConfigDirEnv
  else delete env['CLAUDE_CONFIG_DIR']
  env['CODEX_HOME'] = r.codexHome
  // Agent Store before PR5 reads its own CODEX_CONFIG_DIR instead of CODEX_HOME.
  env['CODEX_CONFIG_DIR'] = r.codexHome
  env['AS_HOME'] = r.asHome
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k]
    else env[k] = v
  }
  return env
}

/** §6.1: directories a `--real` run must not target without --i-mean-this-home. */
export function suspiciousRealRoot(path: string): string | undefined {
  const p = resolve(path)
  const temps = [tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'].map(t => resolve(t))
  if (temps.some(t => p === t || p.startsWith(`${t}/`))) return 'inside a temp directory'
  if (/\/\.paperclip(\/|$)/.test(p) || /\/\.config\/ai-team(\/|$)/.test(p) || /-profile(\/|$)/.test(p)) {
    return 'inside a Paperclip agent profile'
  }
  return undefined
}
