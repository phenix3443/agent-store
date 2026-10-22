// A tiny stand-in for the Agent Store API, serving two deterministic test
// packages so the real `as install` path can be exercised offline in the e2e
// container. Point the CLI at it with AS_STORE_URL=http://127.0.0.1:<port>.
// Responses are built through the API's `mapItem` (see fixture-store.ts).
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { startFixtureStore } from './fixture-store'

const FIXTURES_DIR = process.env.FIXTURES_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const PORT = Number(process.env.FIXTURE_PORT ?? 4599)

// The MCP server runs from the repo checkout inside the image.
const PROBE_MCP_CMD = `node ${join(FIXTURES_DIR, 'probe-mcp.mjs')}`

const store = startFixtureStore({
  port: PORT,
  publisher: { slug: 'agent-store-e2e', name: 'Agent Store E2E', tier: 'official' },
  files: { 'skill.md': join(FIXTURES_DIR, 'skill.md') },
  packages: base => [
    {
      slug: 'e2e-probe-skill',
      name: 'E2E Probe Skill',
      description: 'Deterministic skill used by the e2e harness to prove skills install and load.',
      category: 'skill',
      version: '1.0.0',
      compatibleWith: ['claude', 'codex'],
      installHook: { steps: [{ type: 'file', url: `${base}/files/skill.md`, dest: 'skill.md' }] },
      metadata: { contentUrl: `${base}/files/skill.md` },
    },
    {
      slug: 'e2e-probe-mcp',
      name: 'E2E Probe MCP',
      description: 'Deterministic stdio MCP used by the e2e harness to prove MCP servers install and are callable.',
      category: 'mcp',
      version: '1.0.0',
      compatibleWith: ['claude', 'codex'],
      metadata: { transport: 'stdio', serverCommand: PROBE_MCP_CMD, configSchema: {} },
    },
  ],
})

console.log(`[fixture-server] serving e2e packages on ${store.url}`)
