// The probe packages the acceptance harness installs, and the fixture store
// that serves them. Every probe name starts with `as-probe-` so a real
// environment can be checked for clashes before the run (§6.2 preflight).
import { copyFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { startFixtureStore, type FixtureStore } from '../e2e/fixture-store'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, 'fixtures')
const PROBE_MCP = join(FIXTURES, 'as-probe-mcp.mjs')
const PROBES_REPO_DIR = join(FIXTURES, 'probes-repo')

// The client names a skill `<repo name>-<skill id>`: as-probe + skill → as-probe-skill.
export const PROBE_REPO = 'agent-store-accept/as-probe'

export const SKILL = {
  slug: 'as-probe-skill',
  /** Claude names a skill by its directory, Codex by its frontmatter `name` (§1.1-5). */
  runtimeNames: { claude: 'as-probe-skill', codex: 'as-probe-codeword' },
  /** Only in references/token.md, so finding it proves the whole directory was installed. */
  token: 'AS_PROBE_SKILL_TOKEN_5b2e',
}

export const MCP = { slug: 'as-probe-mcp', tool: 'probe', token: 'AS_PROBE_MCP_OK' }
export const MCP_ENV = {
  slug: 'as-probe-mcp-env',
  tool: 'probe',
  env: 'PROBE_TOKEN',
  /** Contains a space, so it also checks the value survives as one env value. */
  configValue: 'probe tok 42',
  greeting: 'hello world',
}
export const MCP_BROKEN = { slug: 'as-probe-mcp-broken' }

export const PROBE_NAMES = [SKILL.slug, MCP.slug, MCP_ENV.slug, MCP_BROKEN.slug]

export interface ProbeStore extends FixtureStore {
  /** Absolute path of the MCP server script each probe starts. */
  mcpScript: { plain: string; spaced: string }
}

/**
 * Starts the fixture store. `runtimeDir` receives copies of the MCP server: one
 * at a plain path and one under a directory with a space (the G10 fixture).
 * It must outlive every tool process that may start the server.
 */
export function startProbeStore(runtimeDir: string, port = 0): ProbeStore {
  const plain = join(runtimeDir, 'probes', 'as-probe-mcp.mjs')
  const spaced = join(runtimeDir, 'probe dir', 'as-probe-mcp.mjs')
  for (const target of [plain, spaced]) {
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(PROBE_MCP, target)
  }

  const store = startFixtureStore({
    port,
    author: 'agent-store-accept',
    repos: [{ repo: PROBE_REPO, ref: 'main', dir: PROBES_REPO_DIR }],
    resources: [
      {
        kind: 'skill',
        slug: SKILL.slug,
        name: 'Agent Store probe skill',
        description: 'Acceptance probe: a multi-file skill whose token lives in references/token.md.',
        repo: PROBE_REPO,
        skillId: 'skill',
        dir: 'skills/as-probe-skill',
      },
      {
        kind: 'mcp',
        slug: MCP.slug,
        name: 'Agent Store probe MCP',
        description: 'Acceptance probe: a stdio MCP server with one `probe` tool.',
        script: plain,
      },
      {
        kind: 'mcp',
        slug: MCP_ENV.slug,
        name: 'Agent Store probe MCP (env + quoted args)',
        description: 'Acceptance probe for G10: a path with a space, a quoted argument and a required config value.',
        script: spaced,
        args: ['--greeting', MCP_ENV.greeting],
        env: [{ name: MCP_ENV.env, description: 'Probe token' }],
      },
      {
        kind: 'mcp',
        slug: MCP_BROKEN.slug,
        name: 'Agent Store probe MCP (exits at start)',
        description: 'Acceptance probe whose server exits before speaking MCP.',
        script: plain,
        args: ['--exit-immediately'],
      },
    ],
  })
  return { ...store, mcpScript: { plain, spaced } }
}
