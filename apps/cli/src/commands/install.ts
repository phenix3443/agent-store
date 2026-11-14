import type { Engine, InstallOptions, ProjectInstallResult } from '@as/types'
import { formatStep } from '../utils/format'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, errorMessage } from '../utils/exit-codes'

export async function runInstall(
  engine: Engine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<number> {
  const usage = 'Usage: aas install <id|slug> [--target <claude|codex>] [--project <id|dir>] [--force]'
  const rest: string[] = []
  const options: InstallOptions = {}
  let project: string | undefined
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--force') options.force = true
    else if (a === '--project') {
      project = args[++i]
      if (!project) {
        out(`  Error: --project needs a project id or directory`)
        out(usage)
        return EXIT_USAGE
      }
    }
    else if (a === '--target') {
      const t = args[++i]
      if (t !== 'claude' && t !== 'codex') {
        out(`  Error: --target needs claude or codex`)
        out(usage)
        return EXIT_USAGE
      }
      options.target = t
    } else if (a.startsWith('-')) {
      out(`  Error: unknown option ${a}`)
      out(usage)
      return EXIT_USAGE
    } else rest.push(a)
  }
  const ref = rest[0]
  if (!ref) {
    out(usage)
    return EXIT_USAGE
  }
  if (rest.length > 1) {
    out(`${usage} (install takes one item per command)`)
    return EXIT_USAGE
  }

  if (project) return installToProject(engine, project, ref, options, out)

  try {
    const result = await engine.installAndEnable(ref, options.target || options.force ? options : undefined)
    const slug = result.slug
    const home = process.env['AS_HOME'] ?? '~/.agent-store'
    out(formatStep(`Fetching ${ref}@${result.version}...`, 'done'))
    out(formatStep(`Writing to ${home}/${result.category}s/${slug}/`))
    for (const target of result.enabled) out(formatStep(`${result.category === 'skill' ? 'Deploying' : 'Syncing'} to ${target}...`, 'done'))

    out('')
    out(`  Installed ${slug} ${result.version}`)
    for (const n of result.notEnabled) {
      // Nothing the user sets makes an incompatible or unsupported tool work, so there is no next step.
      const next = n.reason === 'needs-config' || n.reason === 'no-key' ? `; then: aas enable ${slug} --for ${n.target}` : ''
      out(`  Not enabled for ${n.target}: ${n.message}${next}`)
    }
    return EXIT_OK
  } catch (err) {
    out(`  Error: ${errorMessage(err)}`)
    return EXIT_FAILURE
  }
}

async function installToProject(engine: Engine, project: string, ref: string, options: InstallOptions, out: (s: string) => void): Promise<number> {
  let result: ProjectInstallResult
  try {
    result = await engine.installToProject(project, ref, {
      ...(options.target ? { targets: [options.target] } : {}),
      ...(options.force ? { force: true } : {}),
    })
  } catch (err) {
    out(`  Error: ${errorMessage(err)}`)
    return EXIT_FAILURE
  }
  for (const i of result.installed) out(`  Wrote ${i.file}`)
  out('')
  out(`  Installed ${result.slug} ${result.version} into the project as "${result.name}"; commit these files to share it`)
  for (const s of result.skipped) out(`  Not installed for ${s.agent}: ${s.message}`)
  if (result.env.length) {
    out(`  The entry reads ${result.env.join(', ')} from the environment; no value was written to the project.`)
    out(`  Store them on this machine: aas projects set-env ${result.projectId} <NAME>, then start the agent with: aas projects exec ${result.projectId} -- <claude|codex>`)
  }
  if (result.kind === 'mcp' && result.installed.some(i => i.agent === 'claude')) out('  Claude Code asks before it starts a server from .mcp.json the first time.')
  if (result.installed.some(i => i.agent === 'codex') && result.kind === 'mcp' && !result.codexTrusted) {
    out('  Codex ignores .codex/config.toml until you trust this project (Codex asks the first time you run it there).')
  }
  return EXIT_OK
}
