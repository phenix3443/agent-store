import { expect, test } from 'bun:test'
import { getIsolatedFixturePathsFromEnv } from '../fixture-env'

function withEnv<T>(
  env: Record<string, string | undefined>,
  run: () => T
): T {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  try {
    return run()
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('fixture env requires explicit isolated directories', () => {
  expect(() =>
    withEnv(
      {
        AS_HOME: undefined,
        CLAUDE_CONFIG_DIR: '/tmp/claude-fixture',
        CODEX_CONFIG_DIR: '/tmp/codex-fixture',
        AGENT_PACKAGE_FIXTURE_ALLOW_HOME_DIRS: undefined,
      },
      () => getIsolatedFixturePathsFromEnv()
    )
  ).toThrow('AS_HOME is required')
})

test('fixture env rejects real home directories by default', () => {
  expect(() =>
    withEnv(
      {
        AS_HOME: `${process.env.HOME}/.agents`,
        CLAUDE_CONFIG_DIR: `${process.env.HOME}/.claude`,
        CODEX_CONFIG_DIR: `${process.env.HOME}/.codex`,
        AGENT_PACKAGE_FIXTURE_ALLOW_HOME_DIRS: undefined,
      },
      () => getIsolatedFixturePathsFromEnv()
    )
  ).toThrow('refuses to use real home directory path')
})

test('fixture env rejects real home directories with trailing slash', () => {
  expect(() =>
    withEnv(
      {
        AS_HOME: `${process.env.HOME}/.agents/`,
        CLAUDE_CONFIG_DIR: `${process.env.HOME}/.claude/`,
        CODEX_CONFIG_DIR: `${process.env.HOME}/.codex/`,
        AGENT_PACKAGE_FIXTURE_ALLOW_HOME_DIRS: undefined,
      },
      () => getIsolatedFixturePathsFromEnv()
    )
  ).toThrow('refuses to use real home directory path')
})

test('fixture env accepts explicit isolated directories', () => {
  const paths = withEnv(
    {
      AS_HOME: '/tmp/as-fixture',
      CLAUDE_CONFIG_DIR: '/tmp/claude-fixture',
      CODEX_CONFIG_DIR: '/tmp/codex-fixture',
      AGENT_PACKAGE_FIXTURE_ALLOW_HOME_DIRS: undefined,
    },
    () => getIsolatedFixturePathsFromEnv()
  )

  expect(paths).toEqual({
    aasHome: '/tmp/as-fixture',
    claudeConfigDir: '/tmp/claude-fixture',
    codexConfigDir: '/tmp/codex-fixture',
  })
})

test('fixture env allows home directories only with explicit override', () => {
  const paths = withEnv(
    {
      AS_HOME: `${process.env.HOME}/.agents`,
      CLAUDE_CONFIG_DIR: `${process.env.HOME}/.claude`,
      CODEX_CONFIG_DIR: `${process.env.HOME}/.codex`,
      AGENT_PACKAGE_FIXTURE_ALLOW_HOME_DIRS: '1',
    },
    () => getIsolatedFixturePathsFromEnv()
  )

  expect(paths.codexConfigDir).toBe(`${process.env.HOME}/.codex`)
})
