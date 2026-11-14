import { spawn } from 'child_process'
import { createInterface } from 'readline'
import type { Engine, ProjectDetail, ToolTarget } from '@as/types'
import { formatTable } from '../utils/format'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, errorMessage } from '../utils/exit-codes'

const USAGE = `Usage: aas projects <command>

  list                              Registered projects
  add <dir> [--name <name>]         Register an existing directory
  remove <project>                  Stop managing a project (no file is deleted)
  move <project> <new-dir>          Point a project at the directory it moved to
  show <project>                    Skills and MCP servers the agents use in the project
  set-env <project> <NAME>          Store a value for a variable the project's MCP servers read (from stdin)
  unset-env <project> <NAME>        Forget a stored value
  env <project>                     Print the stored values as export lines: eval "$(aas projects env .)"
  exec <project> -- <cmd> [args]    Run a command (claude, codex) in the project with the stored values set

<project> is a project id or its directory.`

const AGENT = { claude: 'Claude Code', codex: 'Codex' } as const

export interface ProjectsIo {
  out: (s: string) => void
  /** Reads one secret value; the default hides typing on a terminal. */
  readSecret: (question: string) => Promise<string>
  /** Runs a command and resolves with its exit code. */
  exec: (cmd: string[], cwd: string, env: NodeJS.ProcessEnv) => Promise<number>
}

function readSecret(question: string): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true })
    if (process.stdin.isTTY) {
      process.stdout.write(question)
      ;(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {}
    }
    let answered = false
    rl.on('line', line => { answered = true; rl.close(); if (process.stdin.isTTY) process.stdout.write('\n'); resolve(line) })
    rl.on('close', () => { if (!answered) resolve('') })
  })
}

function execCommand(cmd: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise(resolve => {
    const child = spawn(cmd[0], cmd.slice(1), { cwd, env, stdio: 'inherit' })
    child.on('error', err => { console.error(`  Error: ${err.message}`); resolve(127) })
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 128 : 1)))
  })
}

const defaultIo: ProjectsIo = { out: console.log, readSecret, exec: execCommand }

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

function printDetail(d: ProjectDetail, out: (s: string) => void): void {
  out(`  ${d.name}  ${d.path}${d.exists ? '' : '  (missing)'}`)
  out(`  id: ${d.id}`)
  out(`  Codex: ${d.codexTrusted ? 'project trusted' : 'project not trusted; Codex ignores .codex/config.toml here'}`)
  out('')
  if (!d.skills.length && !d.mcps.length) {
    out('  No project-level skills or MCP servers.')
  }
  const agents = (list: ToolTarget[]) => list.map(a => AGENT[a]).join(', ') || '-'
  if (d.skills.length) {
    const rows = d.skills.map(s => [
      s.name, 'skill', agents(s.agents),
      s.managed ? `Agent Store (${s.slug}${s.locations.some(l => l.modified) ? ', edited' : ''})` : 'project',
    ])
    formatTable(['NAME', 'TYPE', 'USED BY', 'INSTALLED BY'], rows, [24, 6, 20, 34]).forEach(l => out(`  ${l}`))
    out('')
  }
  if (d.mcps.length) {
    const rows = d.mcps.map(m => {
      const notes: string[] = []
      if (m.overridesUser) notes.push('overrides user entry')
      if (m.missingEnv.length) notes.push(`missing ${m.missingEnv.join(', ')}`)
      const pending = m.locations.find(l => l.approval === 'pending')
      if (pending) notes.push('Claude Code approval pending')
      if (m.locations.some(l => l.agent === 'codex') && !d.codexTrusted) notes.push('Codex: untrusted')
      if (m.locations.some(l => l.modified)) notes.push('edited')
      return { row: [m.name, 'mcp', agents(m.agents), m.managed ? `Agent Store (${m.slug})` : 'project'], notes }
    })
    formatTable(['NAME', 'TYPE', 'USED BY', 'INSTALLED BY'], rows.map(r => r.row), [24, 6, 20, 30]).forEach(l => out(`  ${l}`))
    out('')
    d.mcps.forEach((m, i) => {
      for (const l of m.locations) out(`  ${m.name} [${AGENT[l.agent]}${l.scope === 'local' ? ', local' : ''}]: ${l.file}`)
      if (rows[i].notes.length) out(`    ${rows[i].notes.join('; ')}`)
    })
  }
  const missing = d.env.filter(v => !v.stored)
  if (missing.length) {
    out('')
    for (const v of missing) out(`  Set ${v.name} (used by ${v.usedBy.join(', ')}): aas projects set-env ${d.id} ${v.name}`)
  }
}

export async function runProjects(engine: Engine, args: string[], io: ProjectsIo = defaultIo): Promise<number> {
  const { out } = io
  const [sub, ...rest] = args
  const usage = (why?: string) => { if (why) out(`  Error: ${why}`); out(USAGE); return EXIT_USAGE }
  try {
    switch (sub) {
      case 'list': {
        const projects = await engine.listProjects()
        if (!projects.length) { out('No projects registered. Add one with: aas projects add <dir>'); return EXIT_OK }
        formatTable(['NAME', 'PATH', 'ID'], projects.map(p => [p.name, p.exists ? p.path : `${p.path} (missing)`, p.id]), [20, 50, 36])
          .forEach(line => out(line))
        return EXIT_OK
      }
      case 'add': {
        let name: string | undefined
        const dirs: string[] = []
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === '--name') name = rest[++i]
          else if (rest[i].startsWith('-')) return usage(`unknown option ${rest[i]}`)
          else dirs.push(rest[i])
        }
        if (dirs.length !== 1 || (rest.includes('--name') && !name)) return usage()
        const p = await engine.addProject(dirs[0], name ? { name } : undefined)
        out(`  Added ${p.name}: ${p.path} (${p.id})`)
        return EXIT_OK
      }
      case 'remove': {
        if (rest.length !== 1) return usage()
        await engine.removeProject(rest[0])
        out(`  No longer managing ${rest[0]}; its files were left as they are`)
        return EXIT_OK
      }
      case 'move': {
        if (rest.length !== 2) return usage()
        const p = await engine.relocateProject(rest[0], rest[1])
        out(`  ${p.name} is now at ${p.path}`)
        return EXIT_OK
      }
      case 'show': {
        if (rest.length !== 1) return usage()
        printDetail(await engine.getProject(rest[0]), out)
        return EXIT_OK
      }
      case 'set-env': {
        if (rest.length !== 2) return usage('the value is read from stdin, not from the command line')
        const value = await io.readSecret(`  Value for ${rest[1]}: `)
        if (!value) { out('  Error: no value given; nothing was stored'); return EXIT_FAILURE }
        await engine.setProjectEnv(rest[0], rest[1], value)
        out(`  Stored ${rest[1]} for ${rest[0]} on this machine; start agents with: aas projects exec ${rest[0]} -- <claude|codex>`)
        return EXIT_OK
      }
      case 'unset-env': {
        if (rest.length !== 2) return usage()
        await engine.unsetProjectEnv(rest[0], rest[1])
        out(`  Removed ${rest[1]}`)
        return EXIT_OK
      }
      case 'env': {
        if (rest.length !== 1) return usage()
        const values = await engine.getProjectEnvValues(rest[0])
        for (const [k, v] of Object.entries(values)) out(`export ${k}=${shellQuote(v)}`)
        return EXIT_OK
      }
      case 'exec': {
        const sep = rest.indexOf('--')
        const ref = rest[0]
        const cmd = sep === -1 ? rest.slice(1) : rest.slice(sep + 1)
        if (!ref || ref === '--' || (sep !== -1 && sep !== 1) || !cmd.length) return usage()
        const project = await engine.getProject(ref)
        if (!project.exists) { out(`  Error: ${project.path} no longer exists`); return EXIT_FAILURE }
        // Stored values win over the shell's, so the agent sees what `projects show` reports.
        const env = { ...process.env, ...(await engine.getProjectEnvValues(project.id)) }
        return io.exec(cmd, project.path, env)
      }
      default:
        return usage(sub ? `unknown projects command ${sub}` : undefined)
    }
  } catch (err) {
    out(`  Error: ${errorMessage(err)}`)
    return EXIT_FAILURE
  }
}
