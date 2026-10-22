// Acceptance harness: do Claude Code and Codex actually recognize and use the
// global Skills and MCP servers Agent Store installs? See
// docs/global-skills-mcp.md §6 for what each mode proves.
//
//   bun scripts/accept-global.ts [--isolated] [--use] [--only a,b] [--keep]
//   bun scripts/accept-global.ts --real --preflight
//   bun scripts/accept-global.ts --real --backup  --root <new dir>
//   bun scripts/accept-global.ts --real [--use]   --root <backup root>
//   bun scripts/accept-global.ts --real --restore --root <backup root>
//
// Exit codes: 0 every required item passed, 1 any FAIL, 2 INCOMPLETE (a
// required item was skipped, e.g. --use without credentials).
// Requires a current build of the workspace libraries the CLI imports:
//   pnpm --filter=@as/types --filter=@as/sdk --filter=@as/client-core build
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { MCP, MCP_BROKEN, MCP_ENV, SKILL, startProbeStore, type ProbeStore } from '../test/accept/probes'
import { caseFailurePaths, caseMcpConflict, caseMcpEnv, caseRecognition, caseReplace, caseSkillLifecycle } from './accept-global/cases'
import { as, type Ctx } from './accept-global/context'
import { DEFAULT_TIMEOUT_MS, run } from './accept-global/proc'
import { backup, preflight, readManifest, restore } from './accept-global/real'
import { EXIT_FAIL, Reporter } from './accept-global/report'
import { realRoots, suspiciousRealRoot, toolEnv, type Roots } from './accept-global/roots'
import { caseUse } from './accept-global/use'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')

interface Args {
  real: boolean
  use: boolean
  preflight: boolean
  backup: boolean
  restore: boolean
  root?: string
  iMeanThisHome: boolean
  only?: string[]
  keep: boolean
  timeoutMs: number
}

function parseArgs(argv: string[]): Args {
  const value = (flag: string) => {
    const i = argv.indexOf(flag)
    return i === -1 ? undefined : argv[i + 1]
  }
  const known = new Set(['--isolated', '--real', '--use', '--preflight', '--backup', '--restore', '--root', '--i-mean-this-home', '--only', '--keep', '--timeout'])
  for (let i = 0; i < argv.length; i++) {
    if (!known.has(argv[i])) throw new Error(`unknown argument: ${argv[i]}`)
    if (['--root', '--only', '--timeout'].includes(argv[i])) i++
  }
  return {
    real: argv.includes('--real'),
    use: argv.includes('--use'),
    preflight: argv.includes('--preflight'),
    backup: argv.includes('--backup'),
    restore: argv.includes('--restore'),
    root: value('--root'),
    iMeanThisHome: argv.includes('--i-mean-this-home'),
    only: value('--only')?.split(','),
    keep: argv.includes('--keep'),
    timeoutMs: value('--timeout') ? Number(value('--timeout')) * 1000 : DEFAULT_TIMEOUT_MS,
  }
}

const CASES: Record<string, { run: (ctx: Ctx) => Promise<void>; realToo: boolean }> = {
  recognition: { run: caseRecognition, realToo: true },
  'skill-lifecycle': { run: caseSkillLifecycle, realToo: true },
  'mcp-env': { run: caseMcpEnv, realToo: true },
  'mcp-conflict': { run: caseMcpConflict, realToo: false },
  'replace-claude': { run: ctx => caseReplace(ctx, 'claude'), realToo: false },
  'replace-codex': { run: ctx => caseReplace(ctx, 'codex'), realToo: false },
  'failure-paths': { run: caseFailurePaths, realToo: false },
}

function newestMtime(dir: string, skip: RegExp): number {
  let newest = 0
  for (const name of readdirSync(dir)) {
    if (skip.test(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    newest = Math.max(newest, st.isDirectory() ? newestMtime(full, skip) : st.mtimeMs)
  }
  return newest
}

/** The CLI runs from source but imports the libraries' dist/; a stale build tests old code. */
function staleBuilds(): string[] {
  const stale: string[] = []
  for (const pkg of ['packages/types', 'packages/sdk', 'apps/client-core']) {
    const src = join(REPO, pkg, 'src')
    const dist = join(REPO, pkg, 'dist')
    try {
      if (newestMtime(src, /^__tests__$/) > newestMtime(dist, /^__tests__$/)) stale.push(pkg)
    } catch {
      stale.push(`${pkg} (no dist)`)
    }
  }
  return stale
}

async function identity(r: Roots | undefined, mode: string): Promise<Record<string, unknown>> {
  const env = r ? toolEnv(r, mode === 'real' ? 'real' : 'isolated') : { ...process.env } as Record<string, string>
  const version = async (bin: string) => {
    const res = await run([bin, '--version'], { env, cwd: tmpdir(), timeoutMs: 15_000 })
    return res.code === 0 ? res.stdout.trim() : `unavailable (${res.stderr.trim().slice(0, 80)})`
  }
  return {
    mode,
    claude: await version('claude'),
    codex: await version('codex'),
    ...(r ? { HOME: r.home, CLAUDE_CONFIG_DIR: r.claudeConfigDirEnv ?? `(unset: ${r.claudeConfigDir})`, claudeJson: r.claudeJson, CODEX_HOME: r.codexHome, AS_HOME: r.asHome } : {}),
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  const rep = new Reporter()
  const asCmd = [process.execPath, join(REPO, 'apps', 'cli', 'src', 'index.ts')]
  const base = mkdtempSync(join(tmpdir(), 'as-accept-'))
  const cleanups: Array<() => Promise<void> | void> = []
  let summaryIdentity: Record<string, unknown> = {}

  const cleanup = async () => {
    while (cleanups.length) {
      const fn = cleanups.pop()!
      try { await fn() } catch (e) { rep.record('cleanup', 'cleanup step', 'FAIL', String(e)) }
    }
  }
  const onSignal = (sig: string) => {
    console.error(`[accept] ${sig}: cleaning up`)
    void cleanup().finally(() => process.exit(EXIT_FAIL))
  }
  process.on('SIGINT', () => onSignal('SIGINT'))
  process.on('SIGTERM', () => onSignal('SIGTERM'))
  cleanups.push(() => {
    if (args.keep) console.error(`[accept] kept ${base}`)
    else { rmSync(base, { recursive: true, force: true }); console.error(`[accept] removed ${base}`) }
  })

  const body = async (): Promise<void> => {
    let real: Roots | undefined
    if (args.real) {
      real = realRoots(process.env, join(base, 'cwd'))
      mkdirSync(real.cwd, { recursive: true })
      for (const [label, path] of Object.entries({ HOME: real.home, CLAUDE_CONFIG_DIR: real.claudeConfigDir, CODEX_HOME: real.codexHome, AS_HOME: real.asHome })) {
        const why = suspiciousRealRoot(path)
        if (why && !args.iMeanThisHome) {
          rep.record('setup', `--real target ${label}`, 'FAIL', `${path} is ${why}; pass --i-mean-this-home to run anyway`)
          summaryIdentity = await identity(real, 'real')
          return
        }
      }
    }
    summaryIdentity = await identity(real, args.real ? 'real' : 'isolated')
    console.error(`[accept] ${JSON.stringify(summaryIdentity)}`)

    if (args.real && args.preflight) {
      await preflight(real!, rep, args.timeoutMs)
      return
    }
    if (args.real && (args.backup || args.restore)) {
      if (!args.root) throw new Error('--backup/--restore need --root <dir>')
      if (args.backup) backup(real!, args.root, rep)
      else restore(args.root, rep)
      return
    }
    if (args.real) {
      if (!args.root || !readManifest(args.root)) throw new Error('--real needs --root <dir> holding a backup from --real --backup')
      await preflight(real!, rep, args.timeoutMs)
      if (rep.exitCode() !== 0) return
      cleanups.push(() => { restore(args.root!, rep) })
    }

    const stale = staleBuilds()
    if (!rep.check('setup', 'workspace libraries are built from current source', stale.length === 0,
      stale.length ? `stale: ${stale.join(', ')}; run pnpm --filter=@as/types --filter=@as/sdk --filter=@as/client-core build` : undefined)) {
      return
    }

    // The store's runtime dir holds the MCP server scripts; it lives until cleanup.
    const store: ProbeStore = startProbeStore(join(base, 'runtime'))
    cleanups.push(() => store.stop())
    const ctx: Ctx = { mode: args.real ? 'real' : 'isolated', rep, store, asCmd, timeoutMs: args.timeoutMs, base, real }
    if (args.real) {
      cleanups.push(async () => {
        for (const slug of [SKILL.slug, MCP.slug, MCP_ENV.slug, MCP_BROKEN.slug]) {
          const res = await as(ctx, real!, ['uninstall', slug, '--force'])
          if (res.code === 0) console.error(`[accept] cleanup: uninstalled ${slug}`)
        }
      })
    }

    for (const [name, c] of Object.entries(CASES)) {
      if (args.only && !args.only.includes(name)) continue
      if (args.real && !c.realToo) continue
      console.error(`[accept] case ${name}`)
      try { await c.run(ctx) } catch (e) { rep.record('lifecycle', `case ${name} crashed`, 'FAIL', String(e)) }
    }
    if (args.use && (!args.only || args.only.includes('use'))) {
      console.error('[accept] case use')
      try { await caseUse(ctx) } catch (e) { rep.record('usage', 'case use crashed', 'FAIL', String(e)) }
    }
  }

  try {
    await body()
  } catch (e) {
    rep.record('setup', 'harness error', 'FAIL', e instanceof Error ? e.message : String(e))
  } finally {
    await cleanup()
  }
  return finish(rep, summaryIdentity)
}

function finish(rep: Reporter, id: Record<string, unknown>): number {
  console.log(JSON.stringify({ identity: id, ...rep.summary() }, null, 2))
  return rep.exitCode()
}

main().then(code => process.exit(code), err => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err))
  process.exit(EXIT_FAIL)
})
