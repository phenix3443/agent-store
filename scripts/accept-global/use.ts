// --use: the model actually uses what Agent Store installed (U1–U4, §6).
// Needs model credentials; without them the checks are SKIP and the run is
// INCOMPLETE (exit 2), never a pass.
import { copyFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { MCP, MCP_ENV, SKILL } from '../../test/accept/probes'
import { as, newRoots, type Ctx } from './context'
import { excerpt, run, type RunResult } from './proc'
import { toolEnv, type Roots } from './roots'

const USE_TIMEOUT_MS = 240_000

interface Creds {
  claude?: Record<string, string>
  /** auth.json to copy into an isolated CODEX_HOME. */
  codexAuth?: string
}

function isolatedCreds(): Creds {
  const e = process.env
  const claude = e['ANTHROPIC_API_KEY'] || e['ANTHROPIC_AUTH_TOKEN']
    ? Object.fromEntries(
        ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL']
          .filter(k => e[k])
          .map(k => [k, e[k] as string])
      )
    : undefined
  const auth = join(e['AS_ACCEPT_CODEX_AUTH_HOME'] || e['CODEX_HOME'] || join(homedir(), '.codex'), 'auth.json')
  return { claude, codexAuth: existsSync(auth) ? auth : undefined }
}

interface ClaudeRun { result: string; toolUses: string[]; toolResults: string[] }

function parseClaude(stdout: string): ClaudeRun {
  const out: ClaudeRun = { result: '', toolUses: [], toolResults: [] }
  for (const line of stdout.split('\n')) {
    let ev: Record<string, any>
    try { ev = JSON.parse(line) } catch { continue }
    if (ev['type'] === 'result') out.result = String(ev['result'] ?? '')
    for (const block of ev['message']?.content ?? []) {
      if (block?.type === 'tool_use') out.toolUses.push(String(block.name))
      if (block?.type === 'tool_result') out.toolResults.push(JSON.stringify(block.content))
    }
  }
  return out
}

interface CodexRun { messages: string[]; mcpCalls: Array<{ server: string; tool: string; status: string; result: string }> }

function parseCodex(stdout: string): CodexRun {
  const out: CodexRun = { messages: [], mcpCalls: [] }
  for (const line of stdout.split('\n')) {
    let ev: Record<string, any>
    try { ev = JSON.parse(line) } catch { continue }
    if (ev['type'] !== 'item.completed') continue
    const item = ev['item'] ?? {}
    if (item.type === 'agent_message') out.messages.push(String(item.text ?? ''))
    if (item.type === 'mcp_tool_call') {
      out.mcpCalls.push({ server: item.server, tool: item.tool, status: item.status, result: JSON.stringify(item.result ?? item.error ?? null) })
    }
  }
  return out
}

/** The probe result `AS_PROBE_MCP_OK token=<v> argv=[...]` → its parts. */
function probeParts(text: string): { token?: string; argv?: string[] } {
  const unescaped = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  const m = unescaped.match(/AS_PROBE_MCP_OK token=(.*?) argv=(\[.*?\])/)
  if (!m) return {}
  try { return { token: m[1], argv: JSON.parse(m[2]) as string[] } } catch { return { token: m[1] } }
}

async function attempts<T>(n: number, once: () => Promise<{ value: T; ok: boolean }>): Promise<{ value: T; ok: boolean; attempt: number }> {
  let last!: { value: T; ok: boolean }
  for (let i = 1; i <= n; i++) {
    last = await once()
    if (last.ok) return { ...last, attempt: i }
  }
  return { ...last, attempt: n }
}

export async function caseUse(ctx: Ctx, triesPerCheck = 2): Promise<void> {
  const { rep } = ctx
  const sec = 'usage' as const
  const creds: Creds = ctx.mode === 'real' ? {} : isolatedCreds()
  const r: Roots = newRoots(ctx, 'use')
  const installed: string[] = []

  try {
    for (const slug of [SKILL.slug, MCP.slug]) {
      const res = await as(ctx, r, ['install', slug])
      rep.check(sec, `use setup: install ${slug} exits 0`, res.code === 0, excerpt(res))
      if (res.code === 0) installed.push(slug)
    }
    await as(ctx, r, ['install', MCP_ENV.slug]) // fails until configured (§5.6)
    installed.push(MCP_ENV.slug)
    const cfg = await as(ctx, r, ['config', MCP_ENV.slug], { stdin: `${MCP_ENV.configValue}\n` })
    rep.check(sec, 'use setup: configure the env probe', cfg.code === 0, excerpt(cfg))
    for (const tool of ['claude', 'codex']) await as(ctx, r, ['enable', MCP_ENV.slug, '--for', tool])

    // ── Claude Code ──
    const claudeOk = ctx.mode === 'real' || !!creds.claude
    const claudeEnv = toolEnv(r, ctx.mode, creds.claude ?? {})
    const claude = (prompt: string, allowed: string[]): Promise<RunResult> => run(
      ['claude', '-p', prompt, '--output-format', 'stream-json', '--verbose', '--max-turns', '8', '--allowedTools', allowed.join(',')],
      { env: claudeEnv, cwd: r.cwd, timeoutMs: USE_TIMEOUT_MS }
    )
    if (!claudeOk) {
      rep.record(sec, 'U1 claude uses the skill (references/token.md)', 'SKIP', 'no ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN')
      rep.record(sec, 'U2 claude calls the probe MCP tool', 'SKIP', 'no ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN')
      rep.record(sec, 'U2 env probe: token and quoted argument reach the server', 'SKIP', 'no credentials')
    } else {
      const u1 = await attempts(triesPerCheck, async () => {
        const res = await claude('What is the Agent Store probe codeword? Reply with only the codeword.', ['Skill', 'Read'])
        const p = parseClaude(res.stdout)
        return { value: { res, p }, ok: p.result.includes(SKILL.token) }
      })
      rep.check(sec, 'U1 claude uses the skill (references/token.md)', u1.ok,
        `attempt ${u1.attempt}; tools=${u1.value.p.toolUses.join(',') || 'none'}; ${u1.ok ? u1.value.p.result.slice(0, 80) : excerpt(u1.value.res)}`)

      const tool = `mcp__${MCP.slug}__${MCP.tool}`
      const envTool = `mcp__${MCP_ENV.slug}__${MCP_ENV.tool}`
      const u2 = await attempts(triesPerCheck, async () => {
        const res = await claude(
          `Call the ${MCP.tool} tool of the ${MCP.slug} MCP server, then the ${MCP_ENV.tool} tool of the ${MCP_ENV.slug} MCP server. Reply with both tool outputs verbatim, one per line.`,
          [tool, envTool]
        )
        const p = parseClaude(res.stdout)
        return { value: { res, p }, ok: p.toolUses.includes(tool) && p.toolResults.some(t => t.includes(MCP.token)) }
      })
      rep.check(sec, 'U2 claude calls the probe MCP tool', u2.ok,
        `attempt ${u2.attempt}; tools=${u2.value.p.toolUses.join(',') || 'none'}${u2.ok ? '' : `; ${excerpt(u2.value.res)}`}`)
      const envResult = u2.value.p.toolResults.map(probeParts).find(x => x.token === MCP_ENV.configValue)
      rep.check(sec, 'U2 env probe: token and quoted argument reach the server',
        !!envResult && !!envResult.argv?.includes(MCP_ENV.greeting), JSON.stringify(envResult ?? null))
    }

    // ── Codex ──
    const codexOk = ctx.mode === 'real' || !!creds.codexAuth
    if (ctx.mode === 'isolated' && creds.codexAuth) copyFileSync(creds.codexAuth, join(r.codexHome, 'auth.json'))
    const codex = (prompt: string): Promise<RunResult> => run(
      ['codex', 'exec', '--json', '--ephemeral', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox', '-C', r.cwd, prompt],
      { env: toolEnv(r, ctx.mode), cwd: r.cwd, timeoutMs: USE_TIMEOUT_MS }
    )
    if (!codexOk) {
      rep.record(sec, 'U3 codex uses the skill (references/token.md)', 'SKIP', 'no codex auth.json')
      rep.record(sec, 'U4 codex calls the probe MCP tool', 'SKIP', 'no codex auth.json')
      rep.record(sec, 'U4 env probe: token and quoted argument reach the server', 'SKIP', 'no credentials')
    } else {
      const u3 = await attempts(triesPerCheck, async () => {
        const res = await codex('What is the Agent Store probe codeword? Reply with only the codeword.')
        const p = parseCodex(res.stdout)
        return { value: { res, p }, ok: p.messages.some(m => m.includes(SKILL.token)) }
      })
      rep.check(sec, 'U3 codex uses the skill (references/token.md)', u3.ok,
        `attempt ${u3.attempt}; ${u3.ok ? u3.value.p.messages.at(-1)?.slice(0, 80) : excerpt(u3.value.res)}`)

      const u4 = await attempts(triesPerCheck, async () => {
        const res = await codex(
          `Call the ${MCP.tool} tool of the ${MCP.slug} MCP server, then the ${MCP_ENV.tool} tool of the ${MCP_ENV.slug} MCP server. Reply with both tool outputs verbatim, one per line.`
        )
        const p = parseCodex(res.stdout)
        return {
          value: { res, p },
          ok: p.mcpCalls.some(c => c.server === MCP.slug && c.status === 'completed' && c.result.includes(MCP.token)),
        }
      })
      rep.check(sec, 'U4 codex calls the probe MCP tool', u4.ok,
        `attempt ${u4.attempt}; calls=${u4.value.p.mcpCalls.map(c => `${c.server}.${c.tool}:${c.status}`).join(',') || 'none'}${u4.ok ? '' : `; ${excerpt(u4.value.res)}`}`)
      const envCall = u4.value.p.mcpCalls.find(c => c.server === MCP_ENV.slug && c.status === 'completed')
      const parts = envCall ? probeParts(envCall.result) : {}
      rep.check(sec, 'U4 env probe: token and quoted argument reach the server',
        parts.token === MCP_ENV.configValue && !!parts.argv?.includes(MCP_ENV.greeting), JSON.stringify(parts))
    }
  } finally {
    for (const slug of installed) await as(ctx, r, ['uninstall', slug])
  }
}
