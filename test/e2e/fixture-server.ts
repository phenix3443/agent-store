// A tiny stand-in for the Agent Store catalog API, serving two deterministic test
// resources so the real `as install` path can be exercised offline in the e2e
// container. Point the CLI at it with AS_STORE_URL=http://127.0.0.1:<port>, plus
// AS_GITHUB_API_URL=<url>/github-api and AS_CODELOAD_URL=<url>/codeload for the skill.
import { cpSync, mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { startFixtureStore } from './fixture-store'

const FIXTURES_DIR = process.env.FIXTURES_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const PORT = Number(process.env.FIXTURE_PORT ?? 4599)

// The skill is served from a one-skill repo built around fixtures/skill.md.
const repoDir = mkdtempSync(join(tmpdir(), 'as-e2e-repo-'))
mkdirSync(join(repoDir, 'skills', 'e2e-probe-skill'), { recursive: true })
cpSync(join(FIXTURES_DIR, 'skill.md'), join(repoDir, 'skills', 'e2e-probe-skill', 'SKILL.md'))

const store = startFixtureStore({
  port: PORT,
  author: 'agent-store-e2e',
  repos: [{ repo: 'agent-store-e2e/e2e-probe', ref: 'main', dir: repoDir }],
  resources: [
    {
      kind: 'skill',
      slug: 'e2e-probe-skill',
      name: 'E2E Probe Skill',
      description: 'Deterministic skill used by the e2e harness to prove skills install and load.',
      repo: 'agent-store-e2e/e2e-probe',
      skillId: 'skill',
      dir: 'skills/e2e-probe-skill',
    },
    {
      kind: 'mcp',
      slug: 'e2e-probe-mcp',
      name: 'E2E Probe MCP',
      description: 'Deterministic stdio MCP used by the e2e harness to prove MCP servers install and are callable.',
      // The MCP server runs from the repo checkout inside the image.
      script: join(FIXTURES_DIR, 'probe-mcp.mjs'),
    },
    {
      kind: 'mcp',
      slug: 'e2e-probe-keyed-mcp',
      name: 'E2E Probe Keyed MCP',
      description: 'Stdio MCP that needs a key from the environment; the project-level checks install it.',
      script: join(FIXTURES_DIR, 'probe-mcp.mjs'),
      args: ['--require-key'],
      env: [{ name: 'E2E_PROBE_KEY', description: 'Key the probe echoes back' }],
    },
  ],
})

console.log(`[fixture-server] serving e2e resources on ${store.url}`)
