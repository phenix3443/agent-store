import { createEngine } from './engine'
import { runSearch } from './commands/search'
import { runList } from './commands/list'
import { runInfo } from './commands/info'
import { runInstall } from './commands/install'
import { runUninstall } from './commands/uninstall'
import { runEnable } from './commands/enable'
import { runDisable } from './commands/disable'
import { runConfig } from './commands/config'
import { runSync } from './commands/sync'
import { runUpdate } from './commands/update'
import { runRpc } from './commands/rpc'
import { runRelay } from './commands/relay'
import { realRelayOps } from './relay-ops'
import { runUsage } from './commands/usage'
import { runDoctorCommand } from './commands/doctor'
import { runMigrateCommand } from './commands/migrate'
import { runProjects } from './commands/projects'
import { runRelayDaemon, resolvePaths, runDoctor, runMigrate, refreshRelayTakeover, migrateHome, legacyAasHome } from '@as/client-core'
import { migrateHomeOnStartup, refreshRelayOnStartup } from './startup'
import { ensureRelayRunning } from './commands/relay'
import { VERSION } from './version'

const USAGE = `aas — AI Agent Store CLI

Usage: aas <command> [options]
       aas --version

Commands:
  search [query] [--kind <skill|mcp|provider>]   Search the catalog
  install <id|slug> [--target <tool>] [--project <id|dir>] [--force]
                                   Install from the catalog (or reinstall); --project writes
                                   into that project's files instead of your user config
  uninstall <slug> [--project <id|dir> [--target <tool>]] [--force]
                                   Uninstall an item
  projects <list|add|remove|move|show|set-env|unset-env|env|exec>
                                   Project-level skills and MCP servers (aas projects for help)
  enable <slug> --for <tool> [--replace] [--force]   Enable for claude or codex
  disable <slug> --for <tool> [--force]              Disable for claude or codex
  config <slug>                    Configure an item's settings
  sync [--for <tool>]              Sync enabled items to tool configs
  relay <start|stop|status>        Manage the local provider relay
  usage [--days N] [--provider <slug>] [--for <claude|codex>]   Show usage and cost summary
  update [slug]                    Update installed items
  migrate                          Convert skills installed by older versions (backs up first)
  info <id|slug>                   Show an installed item, or a catalog entry
  doctor                           Compare the registry with what Claude Code and Codex actually see
  list [--for <tool>]              List installed items`

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE)
    return
  }

  if (command === '--version' || command === '-V') {
    console.log(`aas ${VERSION}`)
    return
  }

  // The daemon refreshes on its own start; `__rpc` writes JSON to stdout, so warnings go to stderr.
  if (command !== '__relay-daemon') {
    if (!process.env['AS_HOME']) {
      const paths = resolvePaths()
      await migrateHomeOnStartup(
        () => migrateHome({ from: legacyAasHome(), to: paths.aasHome, claudeConfigDir: paths.claudeConfigDir, claudeJsonPath: paths.claudeJsonPath, codexConfigDir: paths.codexConfigDir }),
        () => ensureRelayRunning(realRelayOps()),
      )
    }
    await refreshRelayOnStartup(() => refreshRelayTakeover(resolvePaths()))
  }

  const engine = createEngine()

  switch (command) {
    case 'search':    await runSearch(engine, rest); break
    case 'list':      await runList(engine, rest); break
    case 'info':      await runInfo(engine, rest); break
    case 'install':   process.exitCode = await runInstall(engine, rest); break
    case 'uninstall': process.exitCode = await runUninstall(engine, rest); break
    case 'enable':    process.exitCode = await runEnable(engine, rest); break
    case 'disable':   process.exitCode = await runDisable(engine, rest); break
    case 'config':    await runConfig(engine, rest); break
    case 'sync':      await runSync(engine, rest); break
    case 'update':    process.exitCode = await runUpdate(engine, rest); break
    case 'relay':     await runRelay(rest, realRelayOps()); break
    case 'usage':     await runUsage(engine, rest); break
    case 'migrate':   process.exitCode = await runMigrateCommand(() => runMigrate(resolvePaths())); break
    case 'projects':  process.exitCode = await runProjects(engine, rest); break
    case 'doctor':    process.exitCode = await runDoctorCommand(() => runDoctor(resolvePaths())); break
    case '__relay-daemon': {
      const paths = resolvePaths()
      await runRelayDaemon(paths.aasHome)
      return
    }
    case '__rpc': {
      const code = await runRpc(engine, rest)
      process.exit(code)
    }
    default:
      console.error(`Unknown command: ${command}`)
      console.log(USAGE)
      process.exit(1)
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
