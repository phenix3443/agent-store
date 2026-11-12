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
import { runRelayDaemon, resolvePaths, runDoctor, runMigrate, refreshRelayTakeover } from '@as/client-core'
import { refreshRelayOnStartup } from './startup'

const USAGE = `aas — AI Agent Store CLI

Usage: aas <command> [options]

Commands:
  search <query>                   Search the store
  install <slug> [--target <tool>] [--force]
                                   Install an item (or update if already installed)
  uninstall <slug> [--force]       Uninstall an item
  enable <slug> --for <tool> [--replace]   Enable for claude or codex
  disable <slug> --for <tool> [--force]    Disable for claude or codex
  config <slug>                    Configure an item's settings
  sync [--for <tool>]              Sync enabled items to tool configs
  relay <start|stop|status>        Manage the local provider relay
  usage [--days N] [--provider <slug>] [--for <claude|codex>]   Show usage and cost summary
  update [slug]                    Update installed items
  migrate                          Convert skills installed by older versions (backs up first)
  doctor                           Compare the registry with what Claude Code and Codex actually see
  list [--for <tool>]              List installed items
  info <slug>                      Show item details`

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE)
    return
  }

  // The daemon refreshes on its own start; `__rpc` writes JSON to stdout, so warnings go to stderr.
  if (command !== '__relay-daemon') await refreshRelayOnStartup(() => refreshRelayTakeover(resolvePaths()))

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
    case 'update':    await runUpdate(engine, rest); break
    case 'relay':     await runRelay(rest, realRelayOps()); break
    case 'usage':     await runUsage(engine, rest); break
    case 'migrate':   process.exitCode = await runMigrateCommand(() => runMigrate(resolvePaths())); break
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
