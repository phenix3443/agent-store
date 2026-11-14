// Which agents are on this machine. The engine never refuses to write for an agent it
// does not find: without the CLI it edits the config file itself, and a missing config
// directory is created on the first write. This only reports.
import { lstat } from 'fs/promises'
import { join } from 'path'
import type { AgentDetection, Paths, ToolTarget } from '@as/types'
import { findCli, runCli, type CliCommand } from './config/cli-runner'

const BIN: Record<ToolTarget, { name: string; env: string }> = {
  claude: { name: 'claude', env: 'AS_CLAUDE_BIN' },
  codex: { name: 'codex', env: 'AS_CODEX_BIN' },
}

const VERSION_TIMEOUT_MS = 5_000

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch { return false }
}

async function version(cli: CliCommand): Promise<string | null> {
  const r = await runCli(cli, ['--version'], { ...process.env }, VERSION_TIMEOUT_MS)
  if (r.code !== 0) return null
  return r.stdout.trim().split('\n')[0]?.trim() || null
}

export async function detectAgent(
  paths: Pick<Required<Paths>, 'claudeConfigDir' | 'claudeJsonPath' | 'codexConfigDir'>,
  agent: ToolTarget,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AgentDetection> {
  // The same lookup the engine uses for MCP writes, so "no CLI" here means the engine edits the file.
  const lookup = findCli(BIN[agent].name, BIN[agent].env, env)
  const cli = lookup.kind === 'found' ? lookup.cli : null
  const binary = cli ? [cli.command, ...cli.args].join(' ') : null
  const configDir = agent === 'claude' ? paths.claudeConfigDir : paths.codexConfigDir
  const mcpConfigPath = agent === 'claude' ? paths.claudeJsonPath : join(paths.codexConfigDir, 'config.toml')
  const [configDirExists, mcpConfigExists, v] = await Promise.all([
    exists(configDir), exists(mcpConfigPath), cli ? version(cli) : Promise.resolve(null),
  ])
  return {
    agent, binary, version: v, configDir, configDirExists, mcpConfigPath, mcpConfigExists,
    detected: binary !== null || configDirExists || lookup.kind === 'unrunnable',
    ...(lookup.kind === 'unrunnable' ? { cliUnrunnable: `${lookup.shim}: ${lookup.reason}` } : {}),
  }
}

export function detectAgents(
  paths: Pick<Required<Paths>, 'claudeConfigDir' | 'claudeJsonPath' | 'codexConfigDir'>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AgentDetection[]> {
  return Promise.all((['claude', 'codex'] as ToolTarget[]).map(a => detectAgent(paths, a, env)))
}
