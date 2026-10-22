// Recognition and lifecycle cases (§6 --isolated steps 1–6). Each isolated case
// runs in its own temp root; in --real mode only the cases that touch nothing
// but the probes run, against the real root.
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { MCP, MCP_BROKEN, MCP_ENV, SKILL } from '../../test/accept/probes'
import {
  as, claudeHasSkill, claudeHasTool, claudeMcpStatus, codexListsSkill, codexMcpTools, codexSkillCheck,
  exists, isSymlinkTo, newRoots, readText, skillPaths, viewError, views, type Ctx,
} from './context'
import {
  claudeMcpServers, codexConfigPath, codexMcpServers, deepEqual, equalUnderRule, readCodexConfig,
  registryEntry, sha256File, writeClaudeMcpServers, writeCodexConfig,
} from './configs'
import { excerpt, run, type RunResult } from './proc'
import { claudeView, codexView } from './recognize'
import { Reporter } from './report'
import { toolEnv, type Roots } from './roots'

const ok = (r: RunResult) => r.code === 0
const failed = (r: RunResult) => !r.timedOut && r.code !== null && r.code !== 0

// ── Seeds: unrelated user content that every run must leave alone ────────────

const OTHER_CLAUDE = { type: 'stdio', command: 'node', args: ['-e', 'process.exit(0)'] }
const SEED_COMMENT = '# Agent Store acceptance seed: this comment must survive.'
const OTHER_CODEX_TOML = `${SEED_COMMENT}
model_reasoning_effort = "low"

[mcp_servers.other]
command = "node"
args = ["-e", "process.exit(0)"]
`

function seedUnrelated(r: Roots, codexExtra = ''): void {
  writeClaudeMcpServers(r, { other: OTHER_CLAUDE })
  writeCodexConfig(r, OTHER_CODEX_TOML + codexExtra)
}

/** The user content around the probes: compared after every restore. */
function unrelatedIntact(r: Roots): { ok: boolean; detail: string } {
  const claudeOther = claudeMcpServers(r)['other']
  const codexOther = codexMcpServers(r)['other']
  const text = readText(codexConfigPath(r)) ?? ''
  const codexTop = readCodexConfig(r)['model_reasoning_effort']
  const parts = {
    claudeOther: deepEqual(claudeOther, OTHER_CLAUDE),
    codexOther: deepEqual(codexOther, { command: 'node', args: ['-e', 'process.exit(0)'] }),
    codexTopKey: codexTop === 'low',
    codexComment: text.includes(SEED_COMMENT),
  }
  const bad = Object.entries(parts).filter(([, v]) => !v).map(([k]) => k)
  return { ok: bad.length === 0, detail: bad.length ? `changed: ${bad.join(', ')}` : 'unrelated entries and the comment outside mcp_servers kept' }
}

// ── 1. Install → both tools recognize → uninstall leaves nothing behind ──────

export async function caseRecognition(ctx: Ctx): Promise<void> {
  const { rep } = ctx
  const r = newRoots(ctx, 'recognition')
  if (ctx.mode === 'isolated') seedUnrelated(r)
  const before = { claude: claudeMcpServers(r), codex: readCodexConfig(r), codexText: readText(codexConfigPath(r)) }
  const paths = skillPaths(r, SKILL.slug)

  for (const slug of [SKILL.slug, MCP.slug]) {
    const res = await as(ctx, r, ['install', slug])
    rep.check('recognition', `install ${slug} exits 0`, ok(res), excerpt(res))
  }

  const v = await views(ctx, r)
  rep.check('recognition', 'claude: skill listed by directory name', claudeHasSkill(v, SKILL.runtimeNames.claude),
    viewError(v.claude) ?? (v.claude.ok ? `skills=${v.claude.skills.join(',')}` : ''))
  rep.check('recognition', 'claude: probe MCP connected', claudeMcpStatus(v, MCP.slug) === 'connected',
    viewError(v.claude) ?? `status=${claudeMcpStatus(v, MCP.slug)}`)
  rep.check('recognition', 'claude: probe MCP tool available', claudeHasTool(v, `mcp__${MCP.slug}__${MCP.tool}`))
  rep.check('recognition', 'claude: skill is a symlink to the shared store', isSymlinkTo(paths.claude, paths.agents), paths.claude)
  rep.check('recognition', 'claude: skill directory is complete (references/token.md)',
    (readText(join(paths.claude, 'references', 'token.md')) ?? '').includes(SKILL.token))

  const codexSkill = codexSkillCheck(v, SKILL.runtimeNames.codex, paths.agents)
  rep.check('recognition', 'codex: skill listed once by frontmatter name, from ~/.agents/skills', codexSkill.ok, codexSkill.detail)
  rep.check('recognition', 'codex: skill directory is complete (references/token.md)',
    (readText(join(paths.agents, 'references', 'token.md')) ?? '').includes(SKILL.token))
  rep.check('recognition', 'codex: nothing written to $CODEX_HOME/skills', !exists(paths.codex), paths.codex)
  const tools = codexMcpTools(v, MCP.slug)
  rep.check('recognition', 'codex: probe MCP lists its tool', !!tools?.includes(MCP.tool), viewError(v.codex) ?? `tools=${tools?.join(',') ?? 'server missing'}`)

  let marker: { runtimeNames?: Record<string, string> } | undefined
  try { marker = JSON.parse(readFileSync(join(paths.agents, '.agent-store.json'), 'utf-8')) } catch { /* absent */ }
  rep.check('recognition', 'marker records runtimeNames for both tools', deepEqual(marker?.runtimeNames, SKILL.runtimeNames),
    marker ? JSON.stringify(marker.runtimeNames) : 'no .agent-store.json')

  for (const slug of [SKILL.slug, MCP.slug]) {
    const res = await as(ctx, r, ['uninstall', slug])
    rep.check('recognition', `uninstall ${slug} exits 0`, ok(res), excerpt(res))
  }
  const after = await views(ctx, r)
  rep.check('recognition', 'after uninstall: claude lists neither probe',
    after.claude.ok && !claudeHasSkill(after, SKILL.runtimeNames.claude) && claudeMcpStatus(after, MCP.slug) === undefined,
    viewError(after.claude))
  rep.check('recognition', 'after uninstall: codex lists neither probe',
    after.codex.ok && !codexListsSkill(after, SKILL.runtimeNames.codex) && codexMcpTools(after, MCP.slug) === undefined,
    viewError(after.codex))
  rep.check('recognition', 'after uninstall: skill directory and symlink gone',
    !exists(paths.agents) && !exists(paths.claude) && !exists(paths.codex))
  rep.check('recognition', 'after uninstall: claude mcpServers equal to before install',
    deepEqual(claudeMcpServers(r), before.claude))
  const commentKept = !(before.codexText ?? '').includes(SEED_COMMENT) || (readText(codexConfigPath(r)) ?? '').includes(SEED_COMMENT)
  rep.check('recognition', 'after uninstall: codex config equal to before install (parsed, comment kept)',
    deepEqual(readCodexConfig(r), before.codex) && commentKept)
}

// ── 2. Skill lifecycle (§5.4) ─────────────────────────────────────────────────

export async function caseSkillLifecycle(ctx: Ctx): Promise<void> {
  const { rep } = ctx
  const slug = SKILL.slug
  const r = newRoots(ctx, 'skill-lifecycle')
  const paths = skillPaths(r, slug)
  const sec = 'lifecycle' as const

  let res = await as(ctx, r, ['install', slug])
  rep.check(sec, 'skill: install exits 0', ok(res), excerpt(res))
  const entry = registryEntry(r, slug)
  rep.check(sec, 'skill: install enables both tools', entry?.enabledFor['claude'] === true && entry?.enabledFor['codex'] === true,
    JSON.stringify(entry?.enabledFor))
  let v = await views(ctx, r)
  rep.check(sec, 'skill: both tools recognize after install',
    claudeHasSkill(v, SKILL.runtimeNames.claude) && codexSkillCheck(v, SKILL.runtimeNames.codex, paths.agents).ok)

  res = await as(ctx, r, ['disable', slug, '--for', 'claude'])
  rep.check(sec, 'skill: disable claude exits 0', ok(res), excerpt(res))
  v = await views(ctx, r)
  rep.check(sec, 'skill: after disable claude, claude no longer lists it, codex still does',
    v.claude.ok && !claudeHasSkill(v, SKILL.runtimeNames.claude) && codexSkillCheck(v, SKILL.runtimeNames.codex, paths.agents).ok,
    viewError(v.claude) ?? viewError(v.codex))
  rep.check(sec, 'skill: disable claude keeps the content', exists(join(paths.agents, 'SKILL.md')))

  const beforeCodexDisable = registryEntry(r, slug)
  res = await as(ctx, r, ['disable', slug, '--for', 'codex'])
  rep.check(sec, 'skill: disable codex is rejected (non-zero)', failed(res), excerpt(res))
  v = await views(ctx, r)
  rep.check(sec, 'skill: rejected disable codex leaves state unchanged',
    deepEqual(registryEntry(r, slug)?.enabledFor, beforeCodexDisable?.enabledFor) && codexSkillCheck(v, SKILL.runtimeNames.codex, paths.agents).ok)

  res = await as(ctx, r, ['enable', slug, '--for', 'claude'])
  rep.check(sec, 'skill: enable claude exits 0', ok(res), excerpt(res))
  v = await views(ctx, r)
  rep.check(sec, 'skill: claude recognizes it again', claudeHasSkill(v, SKILL.runtimeNames.claude), viewError(v.claude))

  res = await as(ctx, r, ['uninstall', slug])
  rep.check(sec, 'skill: uninstall exits 0', ok(res), excerpt(res))
  v = await views(ctx, r)
  rep.check(sec, 'skill: after uninstall neither tool lists it',
    v.claude.ok && v.codex.ok && !claudeHasSkill(v, SKILL.runtimeNames.claude) && !codexListsSkill(v, SKILL.runtimeNames.codex))
  rep.check(sec, 'skill: after uninstall directory and symlink gone', !exists(paths.agents) && !exists(paths.claude))

  if (ctx.mode === 'real') return

  // --target claude is rejected; --target codex installs content only.
  const t = newRoots(ctx, 'skill-target')
  const tp = skillPaths(t, slug)
  res = await as(ctx, t, ['install', slug, '--target', 'claude'])
  rep.check(sec, 'skill: install --target claude is rejected and suggests --target codex',
    failed(res) && `${res.stdout}${res.stderr}`.includes('--target codex'), excerpt(res))
  rep.check(sec, 'skill: rejected --target claude writes nothing', !exists(tp.agents) && !exists(tp.claude) && !registryEntry(t, slug))
  res = await as(ctx, t, ['install', slug, '--target', 'codex'])
  rep.check(sec, 'skill: install --target codex exits 0', ok(res), excerpt(res))
  const te = registryEntry(t, slug)
  v = await views(ctx, t)
  rep.check(sec, 'skill: --target codex → codex only, no claude symlink',
    te?.enabledFor['codex'] === true && te?.enabledFor['claude'] === false && !exists(tp.claude) &&
      codexSkillCheck(v, SKILL.runtimeNames.codex, tp.agents).ok && v.claude.ok && !claudeHasSkill(v, SKILL.runtimeNames.claude),
    JSON.stringify(te?.enabledFor))

  // Partial failure: a user's real directory where the symlink would go.
  const p = newRoots(ctx, 'skill-partial')
  const pp = skillPaths(p, slug)
  mkdirSync(pp.claude, { recursive: true })
  writeFileSync(join(pp.claude, 'SKILL.md'), '---\nname: users-own\ndescription: not Agent Store\n---\nmine\n')
  const userBefore = sha256File(join(pp.claude, 'SKILL.md'))
  res = await as(ctx, p, ['install', slug])
  rep.check(sec, 'skill: install over a user directory exits non-zero', failed(res), excerpt(res))
  const pe = registryEntry(p, slug)
  v = await views(ctx, p)
  rep.check(sec, 'skill: partial failure leaves registry truthful (claude:false, codex:true)',
    pe?.enabledFor['claude'] === false && pe?.enabledFor['codex'] === true, JSON.stringify(pe?.enabledFor))
  rep.check(sec, 'skill: partial failure — codex still recognizes the skill', codexSkillCheck(v, SKILL.runtimeNames.codex, pp.agents).ok)
  rep.check(sec, "skill: partial failure — the user's directory is untouched",
    !isSymlinkTo(pp.claude, pp.agents) && sha256File(join(pp.claude, 'SKILL.md')) === userBefore)
}

// ── 3. MCP ownership: conflict and external edit (§5.5) ──────────────────────

const USER_ENTRY_CLAUDE = { type: 'stdio', command: 'node', args: ['users-own.js'] }
const USER_ENTRY_CODEX = `\n[mcp_servers.${MCP.slug}]\ncommand = "node"\nargs = ["users-own.js"]\n`

export async function caseMcpConflict(ctx: Ctx): Promise<void> {
  const { rep } = ctx
  const sec = 'lifecycle' as const

  const r = newRoots(ctx, 'mcp-conflict')
  seedUnrelated(r, USER_ENTRY_CODEX)
  writeClaudeMcpServers(r, { other: OTHER_CLAUDE, [MCP.slug]: USER_ENTRY_CLAUDE })
  const before = { claude: sha256File(r.claudeJson), codex: sha256File(codexConfigPath(r)) }
  let res = await as(ctx, r, ['install', MCP.slug])
  rep.check(sec, 'mcp: install over a same-name user entry fails (non-zero)', failed(res), excerpt(res))
  rep.check(sec, 'mcp: conflict leaves .claude.json byte-identical', sha256File(r.claudeJson) === before.claude)
  res = await as(ctx, r, ['enable', MCP.slug, '--for', 'codex'])
  rep.check(sec, 'mcp: enable codex over a same-name user entry fails (non-zero)', failed(res), excerpt(res))
  rep.check(sec, 'mcp: conflict leaves config.toml byte-identical', sha256File(codexConfigPath(r)) === before.codex)

  const e = newRoots(ctx, 'mcp-external-edit')
  seedUnrelated(e)
  res = await as(ctx, e, ['install', MCP.slug])
  rep.check(sec, 'mcp: install exits 0', ok(res), excerpt(res))
  const claudeServers = claudeMcpServers(e)
  const edited = { ...(claudeServers[MCP.slug] as Record<string, unknown>), env: { EDITED: 'by-user' } }
  writeClaudeMcpServers(e, { ...claudeServers, [MCP.slug]: edited })
  const codexText = readText(codexConfigPath(e)) ?? ''
  writeCodexConfig(e, codexText.replace(/(\[mcp_servers\.as-probe-mcp\]\n)/, '$1startup_timeout_sec = 9\n'))
  res = await as(ctx, e, ['uninstall', MCP.slug])
  rep.check(sec, 'mcp: uninstall after an external edit is refused (non-zero)', failed(res), excerpt(res))
  rep.check(sec, 'mcp: refused uninstall keeps the edited entries',
    deepEqual(claudeMcpServers(e)[MCP.slug], edited) &&
      (codexMcpServers(e)[MCP.slug] as Record<string, unknown> | undefined)?.['startup_timeout_sec'] === 9)
  res = await as(ctx, e, ['uninstall', MCP.slug, '--force'])
  rep.check(sec, 'mcp: uninstall --force removes them', ok(res) && !(MCP.slug in claudeMcpServers(e)) && !(MCP.slug in codexMcpServers(e)), excerpt(res))
  const intact = unrelatedIntact(e)
  rep.check(sec, 'mcp: unrelated content intact after the external-edit sequence', intact.ok, intact.detail)
}

// ── 4. --replace: not restorable / restorable / failing probe (§5.5) ─────────

interface Seed<T> { name: string; value: T }

const CLAUDE_NOT_RESTORABLE: Array<Seed<Record<string, unknown>> & { mustName: string[] }> = [
  { name: 'review case (http + headers + unknown)', value: { type: 'http', url: 'https://example.invalid/mcp', headers: { 'X-Test': 'preserve-me' }, unknown: 'keep' }, mustName: ['unknown'] },
  { name: 'http + env + unknown', value: { type: 'http', url: 'https://example.invalid/mcp', env: { K: 'v' }, unknown: 'x' }, mustName: ['unknown'] },
]
const CLAUDE_RESTORABLE: Array<Seed<Record<string, unknown>>> = [
  { name: 'stdio with spaced arg and env', value: { type: 'stdio', command: 'node', args: ['/tmp/a b/s.js', '--flag'], env: { K: 'v 1' } } },
  { name: 'http with headers', value: { type: 'http', url: 'https://example.invalid/mcp', headers: { 'X-Test': 'preserve-me' } } },
  { name: 'command only', value: { command: 'node' } },
]

const CODEX_NOT_RESTORABLE = {
  name: 'review case (url + http_headers + startup_timeout_sec + enabled=false)',
  toml: (n: string) => `\n[mcp_servers.${n}]\nurl = "https://example.invalid/mcp"\nhttp_headers = { "X-Test" = "preserve-me" }\nstartup_timeout_sec = 37\nenabled = false\n`,
  mustName: ['http_headers', 'startup_timeout_sec', 'enabled'],
}
const CODEX_RESTORABLE: Array<{ name: string; toml: (n: string) => string; explicitEmpty?: boolean }> = [
  { name: 'stdio with spaced arg and env', toml: n => `\n[mcp_servers.${n}]\ncommand = "node"\nargs = ["/tmp/a b/s.js", "--flag"]\n\n[mcp_servers.${n}.env]\nK = "v 1"\n` },
  { name: 'url + bearer_token_env_var', toml: n => `\n[mcp_servers.${n}]\nurl = "https://example.invalid/mcp"\nbearer_token_env_var = "AS_PROBE_BEARER"\n` },
  { name: 'command only', toml: n => `\n[mcp_servers.${n}]\ncommand = "node"\n` },
  { name: 'explicit empty args/env', toml: n => `\n[mcp_servers.${n}]\ncommand = "node"\nargs = []\nenv = {}\n`, explicitEmpty: true },
]

function seedEntry(tool: 'claude' | 'codex', r: Roots, name: string, claude?: Record<string, unknown>, codexToml?: string): unknown {
  if (tool === 'claude') {
    seedUnrelated(r)
    writeClaudeMcpServers(r, { other: OTHER_CLAUDE, [name]: claude })
    return claude
  }
  seedUnrelated(r, codexToml)
  return codexMcpServers(r)[name]
}

function toolEntry(tool: 'claude' | 'codex', r: Roots, name: string): unknown {
  return tool === 'claude' ? claudeMcpServers(r)[name] : codexMcpServers(r)[name]
}

const toolFile = (tool: 'claude' | 'codex', r: Roots) => (tool === 'claude' ? r.claudeJson : codexConfigPath(r))

async function codexGetJson(ctx: Ctx, r: Roots, name: string): Promise<Record<string, unknown> | undefined> {
  const res = await run(['codex', 'mcp', 'get', name, '--json'], { env: toolEnv(r, ctx.mode), cwd: r.cwd, timeoutMs: ctx.timeoutMs })
  if (res.code !== 0) return undefined
  try { return JSON.parse(res.stdout) as Record<string, unknown> } catch { return undefined }
}

/** `command` and `args` of a `codex mcp get --json` result (its `env` is `{}` vs `null` for the two forms). */
function commandAndArgs(get: Record<string, unknown>): string {
  const t = get['transport'] as { command?: unknown; args?: unknown } | undefined
  return JSON.stringify([t?.command, t?.args])
}

function ourProbeEntry(entry: unknown, script: string): boolean {
  const e = entry as { command?: string; args?: string[] } | undefined
  return !!e && (e.command === script || (e.args ?? []).includes(script))
}

export async function caseReplace(ctx: Ctx, tool: 'claude' | 'codex'): Promise<void> {
  const { rep } = ctx
  const sec = 'lifecycle' as const
  const tag = `${tool} --replace`

  const notRestorable = tool === 'claude'
    ? CLAUDE_NOT_RESTORABLE.map(s => ({ name: s.name, claude: s.value, toml: undefined as string | undefined, mustName: s.mustName }))
    : [{ name: CODEX_NOT_RESTORABLE.name, claude: undefined, toml: CODEX_NOT_RESTORABLE.toml(MCP.slug), mustName: CODEX_NOT_RESTORABLE.mustName }]
  for (const s of notRestorable) {
    const r = newRoots(ctx, `replace-${tool}-nr`)
    seedEntry(tool, r, MCP.slug, s.claude, s.toml)
    const sha = sha256File(toolFile(tool, r))
    await as(ctx, r, ['install', MCP.slug])
    const res = await as(ctx, r, ['enable', MCP.slug, '--for', tool, '--replace'])
    const out = `${res.stdout}\n${res.stderr}`
    rep.check(sec, `${tag}: not restorable (${s.name}) is refused before writing`, failed(res), excerpt(res))
    rep.check(sec, `${tag}: refusal names ${s.mustName.join(', ')}`, s.mustName.every(k => out.includes(k)))
    rep.check(sec, `${tag}: refused takeover leaves the file byte-identical (${s.name})`, sha256File(toolFile(tool, r)) === sha)
  }

  const restorable = tool === 'claude'
    ? CLAUDE_RESTORABLE.map(s => ({ name: s.name, claude: s.value, toml: undefined as string | undefined, explicitEmpty: false }))
    : CODEX_RESTORABLE.map(s => ({ name: s.name, claude: undefined, toml: s.toml(MCP.slug), explicitEmpty: !!s.explicitEmpty }))
  for (const s of restorable) {
    for (const how of ['disable', 'uninstall'] as const) {
      const r = newRoots(ctx, `replace-${tool}-ok`)
      const seed = seedEntry(tool, r, MCP.slug, s.claude, s.toml)
      const seedGet = tool === 'codex' && s.explicitEmpty ? await codexGetJson(ctx, r, MCP.slug) : undefined
      await as(ctx, r, ['install', MCP.slug])
      let res = await as(ctx, r, ['enable', MCP.slug, '--for', tool, '--replace'])
      rep.check(sec, `${tag}: restorable (${s.name}) is taken over`, ok(res) && ourProbeEntry(toolEntry(tool, r, MCP.slug), ctx.store.mcpScript.plain), excerpt(res))
      res = how === 'disable'
        ? await as(ctx, r, ['disable', MCP.slug, '--for', tool])
        : await as(ctx, r, ['uninstall', MCP.slug])
      const restored = toolEntry(tool, r, MCP.slug)
      rep.check(sec, `${tag}: ${how} restores the seed (${s.name})`, ok(res) && equalUnderRule(tool, restored, seed),
        `${excerpt(res, 160)}; now ${JSON.stringify(restored)}`)
      const intact = unrelatedIntact(r)
      rep.check(sec, `${tag}: ${how} keeps unrelated content (${s.name})`, intact.ok, intact.detail)
      if (tool === 'codex' && s.explicitEmpty && how === 'disable') {
        const get = await codexGetJson(ctx, r, MCP.slug)
        rep.check(sec, `${tag}: explicit-empty seed comes back as command only`, deepEqual(restored, { command: 'node' }), JSON.stringify(restored))
        rep.check(sec, `${tag}: explicit-empty seed — codex mcp get reports the same command/args`,
          !!get && !!seedGet && commandAndArgs(get) === commandAndArgs(seedGet),
          `seed=${JSON.stringify(seedGet?.['transport'])} restored=${JSON.stringify(get?.['transport'])}`)
      }
    }
  }

  // Failing probe: the probe's server exits at start. Its recognition must
  // fail, cleanup must still restore the seed, and the run must exit 1.
  const r = newRoots(ctx, `replace-${tool}-failing`)
  const seed = tool === 'claude'
    ? seedEntry(tool, r, MCP_BROKEN.slug, { type: 'stdio', command: 'node', args: ['-e', '0'] })
    : seedEntry(tool, r, MCP_BROKEN.slug, undefined, `\n[mcp_servers.${MCP_BROKEN.slug}]\ncommand = "node"\nargs = ["-e", "0"]\n`)
  await as(ctx, r, ['install', MCP_BROKEN.slug])
  const res = await as(ctx, r, ['enable', MCP_BROKEN.slug, '--for', tool, '--replace'])
  const sub = new Reporter(() => {})
  try {
    sub.check('recognition', 'replaced entry is ours', ok(res) && ourProbeEntry(toolEntry(tool, r, MCP_BROKEN.slug), ctx.store.mcpScript.plain))
    const v = await views(ctx, r)
    sub.check('recognition', 'failing probe connected', tool === 'claude'
      ? claudeMcpStatus(v, MCP_BROKEN.slug) === 'connected'
      : !!codexMcpTools(v, MCP_BROKEN.slug)?.includes(MCP.tool))
  } finally {
    await as(ctx, r, ['disable', MCP_BROKEN.slug, '--for', tool])
  }
  rep.check(sec, `${tag}: failing probe is reported as FAIL (run would exit 1)`, sub.exitCode() === 1,
    sub.items.map(i => `${i.name}=${i.status}`).join(', '))
  rep.check(sec, `${tag}: cleanup after the failing probe restores the seed`,
    equalUnderRule(tool, toolEntry(tool, r, MCP_BROKEN.slug), seed), JSON.stringify(toolEntry(tool, r, MCP_BROKEN.slug)))
}

// ── 5. G10: quoted args, path with a space, required config (§5.6) ───────────

export async function caseMcpEnv(ctx: Ctx): Promise<void> {
  const { rep } = ctx
  const sec = 'lifecycle' as const
  const r = newRoots(ctx, 'mcp-env')
  const slug = MCP_ENV.slug

  let res = await as(ctx, r, ['install', slug])
  const out = `${res.stdout}\n${res.stderr}`
  rep.check(sec, 'g10: install without the required config exits non-zero', failed(res), excerpt(res))
  rep.check(sec, 'g10: the error points at `as config`', /\bas config\b|aas config/.test(out))
  rep.check(sec, 'g10: nothing written to either tool before config',
    !(slug in claudeMcpServers(r)) && !(slug in codexMcpServers(r)))

  res = await as(ctx, r, ['config', slug], { stdin: `${MCP_ENV.configValue}\n` })
  rep.check(sec, 'g10: as config exits 0', ok(res), excerpt(res))
  for (const tool of ['claude', 'codex'] as const) {
    res = await as(ctx, r, ['enable', slug, '--for', tool])
    rep.check(sec, `g10: enable ${tool} exits 0`, ok(res), excerpt(res))
  }

  const spaced = ctx.store.mcpScript.spaced
  for (const tool of ['claude', 'codex'] as const) {
    const e = toolEntry(tool, r, slug) as { command?: string; args?: string[]; env?: Record<string, string> } | undefined
    const argv = [e?.command, ...(e?.args ?? [])]
    rep.check(sec, `g10: ${tool} entry keeps the spaced path and quoted argument as single items`,
      argv.includes(spaced) && argv.includes(MCP_ENV.greeting), JSON.stringify(argv))
    rep.check(sec, `g10: ${tool} entry binds ${MCP_ENV.env} from config`, e?.env?.[MCP_ENV.env] === MCP_ENV.configValue, JSON.stringify(e?.env))
  }
  const v = await views(ctx, r)
  rep.check(sec, 'g10: claude connects and lists the tool',
    claudeMcpStatus(v, slug) === 'connected' && claudeHasTool(v, `mcp__${slug}__${MCP_ENV.tool}`), viewError(v.claude) ?? `status=${claudeMcpStatus(v, slug)}`)
  rep.check(sec, 'g10: codex lists the tool', !!codexMcpTools(v, slug)?.includes(MCP_ENV.tool), viewError(v.codex))

  if (ctx.mode === 'real') {
    res = await as(ctx, r, ['uninstall', slug])
    rep.check(sec, 'g10: uninstall exits 0', ok(res), excerpt(res))
  }
}

// ── 6. Failure paths: each must exit non-zero and leave files byte-identical ─

export async function caseFailurePaths(ctx: Ctx): Promise<void> {
  const { rep } = ctx
  const sec = 'lifecycle' as const
  const r = newRoots(ctx, 'failure-paths')
  let res = await as(ctx, r, ['install', MCP.slug])
  rep.check(sec, 'failure: setup install exits 0', ok(res), excerpt(res))

  writeFileSync(r.claudeJson, '{"mcpServers": {broken')
  let sha = sha256File(r.claudeJson)
  res = await as(ctx, r, ['enable', MCP.slug, '--for', 'claude'])
  rep.check(sec, 'failure: broken .claude.json → non-zero', failed(res), excerpt(res))
  rep.check(sec, 'failure: broken .claude.json stays byte-identical', sha256File(r.claudeJson) === sha)

  writeFileSync(codexConfigPath(r), '[mcp_servers.x\ncommand = ')
  sha = sha256File(codexConfigPath(r))
  res = await as(ctx, r, ['enable', MCP.slug, '--for', 'codex'])
  rep.check(sec, 'failure: broken config.toml → non-zero', failed(res), excerpt(res))
  rep.check(sec, 'failure: broken config.toml stays byte-identical', sha256File(codexConfigPath(r)) === sha)

  const u = newRoots(ctx, 'failure-store')
  res = await as(ctx, u, ['install', SKILL.slug], { storeUrl: 'http://127.0.0.1:9' })
  rep.check(sec, 'failure: unreachable store → non-zero', failed(res), excerpt(res))
  rep.check(sec, 'failure: unreachable store leaves no trace', !exists(skillPaths(u, SKILL.slug).agents) && !registryEntry(u, SKILL.slug))

  // A tool binary that hangs: the bound must fire and the step must report FAIL.
  const stub = join(ctx.base, 'hanging-bin')
  mkdirSync(stub, { recursive: true })
  for (const bin of ['claude', 'codex']) writeFileSync(join(stub, bin), '#!/bin/sh\nexec sleep 600\n', { mode: 0o755 })
  const env = toolEnv(u, ctx.mode)
  const bound = 3000
  const [c, x] = await Promise.all([
    claudeView({ env, cwd: u.cwd, timeoutMs: bound, bin: join(stub, 'claude') }),
    codexView({ env, cwd: u.cwd, timeoutMs: bound, bin: join(stub, 'codex') }),
  ])
  const timely = (v: typeof c | typeof x) => !v.ok && v.timedOut && v.ms < bound + 2000
  rep.check(sec, 'failure: hanging tool binary hits the timeout and reports FAIL', timely(c) && timely(x),
    `claude ${c.ok ? 'ok?' : `${c.ms}ms`}, codex ${x.ok ? 'ok?' : `${x.ms}ms`}`)
}
