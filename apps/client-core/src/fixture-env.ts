import { homedir } from 'os'
import { join, resolve } from 'path'
import type { Paths } from '@as/types'

function requireEnv(name: 'AS_HOME' | 'CLAUDE_CONFIG_DIR' | 'CODEX_CONFIG_DIR'): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required for agent-package fixture runs`)
  }
  return value
}

export function getIsolatedFixturePathsFromEnv(): Required<Paths> {
  const home = homedir()
  const paths: Required<Paths> = {
    aasHome: requireEnv('AS_HOME'),
    claudeConfigDir: requireEnv('CLAUDE_CONFIG_DIR'),
    claudeJsonPath: join(requireEnv('CLAUDE_CONFIG_DIR'), '.claude.json'),
    codexConfigDir: requireEnv('CODEX_CONFIG_DIR'),
  }

  if (process.env['AGENT_PACKAGE_FIXTURE_ALLOW_HOME_DIRS'] === '1') {
    return paths
  }

  const disallowed: Array<[string, string]> = [
    [paths.aasHome, join(home, '.agents')],
    [paths.aasHome, join(home, '.agent-store')],
    [paths.claudeConfigDir, join(home, '.claude')],
    [paths.codexConfigDir, join(home, '.codex')],
  ]

  for (const [actual, expectedHomePath] of disallowed) {
    if (resolve(actual) === resolve(expectedHomePath)) {
      throw new Error(
        `agent-package fixture refuses to use real home directory path: ${actual}. ` +
          'Set explicit isolated dirs, or set AGENT_PACKAGE_FIXTURE_ALLOW_HOME_DIRS=1 in a disposable environment.'
      )
    }
  }

  return paths
}
