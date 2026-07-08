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

  const disallowed = new Map<string, string>([
    [resolve(paths.aasHome), resolve(join(home, '.agents'))],
    [resolve(paths.claudeConfigDir), resolve(join(home, '.claude'))],
    [resolve(paths.codexConfigDir), resolve(join(home, '.codex'))],
  ])

  for (const [actual, expectedHomePath] of disallowed.entries()) {
    if (actual === expectedHomePath) {
      throw new Error(
        `agent-package fixture refuses to use real home directory path: ${actual}. ` +
          'Set explicit isolated dirs, or set AGENT_PACKAGE_FIXTURE_ALLOW_HOME_DIRS=1 in a disposable environment.'
      )
    }
  }

  return paths
}
