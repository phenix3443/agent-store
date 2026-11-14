// Checks the aas sidecar shipped inside an installed desktop bundle, on macOS and Windows:
//   bun test/desktop-smoke/sidecar.ts <path to the bundled aas> <out dir> <expected version>
// Every __rpc call is spawned the way the client's shell plugin spawns it: arguments on a
// pipe, one line, stdin never closed. Installs go into throwaway AS_HOME, CLAUDE_CONFIG_DIR
// and CODEX_HOME. Appends to <out dir>/result.txt and exits non-zero if a check fails.
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const [sidecar, out, expectedVersion] = process.argv.slice(2)
if (!sidecar || !out || !expectedVersion) {
  console.error('usage: sidecar.ts <aas> <out dir> <expected version>')
  process.exit(2)
}
mkdirSync(out, { recursive: true })
const resultFile = join(out, 'result.txt')
const transcript = join(out, 'sidecar.txt')
writeFileSync(transcript, '')

const SKILL_ID = 'github:vercel-labs/skills/find-skills'
const SKILL_SLUG = 'skills-find-skills'
const SKILL_DIR = 'find-skills'
const MCP_ID = 'mcp-registry:io.github.upstash/context7'

let failed = false
function log(line: string): void {
  console.log(line)
  appendFileSync(resultFile, `${line}\n`)
}
function check(name: string, ok: boolean, detail = ''): void {
  log(`${ok ? 'ok' : 'FAIL'}: ${name}${detail ? ` (${detail})` : ''}`)
  if (!ok) failed = true
}

const root = realpathSync(mkdtempSync(join(tmpdir(), 'as-smoke-')))
const homes = {
  AS_HOME: join(root, 'agent-store'),
  CLAUDE_CONFIG_DIR: join(root, 'claude'),
  CODEX_HOME: join(root, 'codex'),
}
for (const dir of Object.values(homes)) mkdirSync(dir, { recursive: true })
// The runner may or may not have claude / codex on PATH; pin the file-edit path so the
// result does not depend on the image.
const env = { ...process.env, ...homes, AS_CLAUDE_BIN: '', AS_CODEX_BIN: '' }

interface Run { code: number | null; stdout: string; stderr: string; timedOut: boolean }

function run(argv: string[], input?: string, timeoutMs = 120_000): Promise<Run> {
  return new Promise(resolve => {
    const child = spawn(sidecar, argv, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout.setEncoding('utf8').on('data', d => { stdout += d })
    child.stderr.setEncoding('utf8').on('data', d => { stderr += d })
    const timer = setTimeout(() => { timedOut = true; child.kill() }, timeoutMs)
    child.on('error', err => { clearTimeout(timer); resolve({ code: 127, stdout, stderr: stderr + String(err), timedOut }) })
    child.on('close', code => {
      clearTimeout(timer)
      appendFileSync(transcript, `$ aas ${argv.join(' ')}${input === undefined ? '' : ` <<< ${JSON.stringify(input)}`}\nexit ${code}${timedOut ? ' (timed out)' : ''}\n${stdout}${stderr ? `[stderr]\n${stderr}` : ''}\n`)
      resolve({ code, stdout, stderr, timedOut })
    })
    if (input !== undefined) child.stdin.write(input)
  })
}

interface Envelope<T> { ok: boolean; data?: T; error?: string; code?: string }

// The live test catalog sometimes answers 503 while it redeploys; that is not the client's fault.
function catalogDown(e: Envelope<unknown> | undefined): boolean {
  return e?.code === 'CatalogUnavailableError' || (e?.ok === true && (e.data as { offline?: boolean } | null)?.offline === true)
}

async function rpc<T>(method: string, args: unknown[], eol = '\n'): Promise<{ run: Run; envelope?: Envelope<T> }> {
  for (let attempt = 1; ; attempt++) {
    const r = await run(['__rpc', method, '-'], `${JSON.stringify(args)}${eol}`)
    let envelope: Envelope<T> | undefined
    try { envelope = JSON.parse(r.stdout) as Envelope<T> } catch { /* reported by the caller */ }
    if (!catalogDown(envelope) || attempt === 3) return { run: r, envelope }
    log(`catalog unavailable for ${method}, retrying in 20s (attempt ${attempt})`)
    await Bun.sleep(20_000)
  }
}

function rpcOk(name: string, r: { run: Run; envelope?: Envelope<unknown> }): boolean {
  const ok = r.run.code === 0 && r.envelope?.ok === true
  check(name, ok, ok ? '' : `exit ${r.run.code}${r.run.timedOut ? ', timed out' : ''}: ${(r.envelope?.error ?? r.run.stdout + r.run.stderr).slice(0, 300)}`)
  return ok
}

function readJson(path: string): Record<string, unknown> | undefined {
  try { return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> } catch { return undefined }
}

/** 'symlink' | 'copy' | a description of what is there instead. */
function deployedAs(path: string, library: string): string {
  let st
  try { st = lstatSync(path) } catch { return 'absent' }
  if (st.isSymbolicLink()) {
    try { return realpathSync(path) === realpathSync(library) ? 'symlink' : `link to ${realpathSync(path)}` } catch { return 'dangling link' }
  }
  if (st.isDirectory()) return existsSync(join(path, 'SKILL.md')) ? 'copy' : 'directory without SKILL.md'
  return 'file'
}

function tree(dir: string, depth = 0): string {
  if (depth > 4) return ''
  let text = ''
  let names: string[] = []
  try { names = readdirSync(dir) } catch { return '' }
  for (const name of names) {
    const p = join(dir, name)
    let kind = '?'
    try { const st = lstatSync(p); kind = st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : 'file' } catch { /* gone */ }
    text += `${'  '.repeat(depth)}${name} [${kind}]\n`
    if (kind === 'dir') text += tree(p, depth + 1)
  }
  return text
}

log(`sidecar: ${sidecar}`)
log(`platform: ${process.platform} ${process.arch}`)

const version = await run(['--version'])
check('aas --version exits 0', version.code === 0, `exit ${version.code}: ${(version.stdout + version.stderr).trim().slice(0, 200)}`)
check(`aas --version reports ${expectedVersion}`, version.stdout.trim() === `aas ${expectedVersion}`, version.stdout.trim())

const search = await rpc<unknown>('search', ['find-skills', { kind: 'skill' }])
if (rpcOk('__rpc search - (args on stdin, LF)', search)) {
  check('search finds find-skills', JSON.stringify(search.envelope?.data ?? []).includes('find-skills'))
}
// A writer that ends lines in CRLF (PowerShell, a Windows text pipe) must parse the same.
rpcOk('__rpc search - (args on stdin, CRLF)', await rpc('search', ['find-skills', { kind: 'skill' }], '\r\n'))
// Non-ASCII arguments, as typed into the search field.
rpcOk('__rpc search - (non-ASCII argument)', await rpc('search', ['技能 ünïcode', { kind: 'skill' }]))
rpcOk('__rpc list - (empty home)', await rpc('list', []))
rpcOk('__rpc doctor -', await rpc('doctor', []))

const skill = await rpc<{ enabled?: string[] }>('installAndEnable', [SKILL_ID])
if (rpcOk(`__rpc installAndEnable ${SKILL_ID}`, skill)) {
  log(`skill enabled for: ${(skill.envelope?.data?.enabled ?? []).join(', ')}`)
}
const library = join(homes.AS_HOME, 'skills', SKILL_SLUG)
check('skill library copy has the marker', existsSync(join(library, '.agent-store.json')) && existsSync(join(library, 'SKILL.md')))
check('nothing went into the shared ~/.agents/skills', !existsSync(join(homedir(), '.agents', 'skills', SKILL_DIR)))

const list = await rpc<Array<{ slug: string; deployments?: Record<string, { path: string; mode: string }> }>>('list', [])
rpcOk('__rpc list - (after installs)', list)
const deployments = list.envelope?.data?.find(e => e.slug === SKILL_SLUG)?.deployments ?? {}
for (const [tool, dir] of [['claude', homes.CLAUDE_CONFIG_DIR], ['codex', homes.CODEX_HOME]] as const) {
  const target = join(dir, 'skills', SKILL_DIR)
  const onDisk = deployedAs(target, library)
  const record = deployments[tool]
  log(`${tool} skill deployment: ${onDisk} at ${target}; registry says ${record ? `${record.mode} at ${record.path}` : 'nothing'}`)
  check(`${tool} skill is deployed as a link or a copy`, onDisk === 'symlink' || onDisk === 'copy', onDisk)
  check(`${tool} registry record matches the disk`, record?.mode === onDisk && record?.path === target)
}

const mcp = await rpc<{ enabled?: string[]; notEnabled?: unknown[] }>('installAndEnable', [MCP_ID])
if (rpcOk(`__rpc installAndEnable ${MCP_ID}`, mcp)) {
  log(`mcp enabled for: ${(mcp.envelope?.data?.enabled ?? []).join(', ')}; not enabled: ${JSON.stringify(mcp.envelope?.data?.notEnabled ?? [])}`)
}
const servers = (readJson(join(homes.CLAUDE_CONFIG_DIR, '.claude.json'))?.['mcpServers'] ?? {}) as Record<string, unknown>
log(`claude mcpServers: ${JSON.stringify(servers)}`)
check('context7 written to $CLAUDE_CONFIG_DIR/.claude.json', JSON.stringify(servers).includes('@upstash/context7-mcp'))
let codexToml = ''
try { codexToml = readFileSync(join(homes.CODEX_HOME, 'config.toml'), 'utf8') } catch { /* checked below */ }
log(`codex config.toml:\n${codexToml}`)
check('context7 written to $CODEX_HOME/config.toml', codexToml.includes('@upstash/context7-mcp'))

appendFileSync(transcript, `\n$ tree ${root}\n${tree(root)}`)
log(`sidecar: ${failed ? 'FAIL' : 'PASS'}`)
process.exit(failed ? 1 : 0)
