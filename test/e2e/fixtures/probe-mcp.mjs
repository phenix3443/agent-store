#!/usr/bin/env node
// Minimal stdio MCP server used only by the e2e harness. It exposes a single
// deterministic tool, `e2e_probe`, that returns a fixed token — so a test can
// prove an MCP installed via Agent Store is actually reachable and callable by
// the agent (claude / codex).
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

// With --require-key the server is the project-level probe: it refuses to start
// without E2E_PROBE_KEY and returns a token built from it, so a passing check
// proves the value reached the server through the agent's environment.
const requireKey = process.argv.includes('--require-key')
const key = process.env.E2E_PROBE_KEY
if (requireKey && !key) {
  console.error('E2E_PROBE_KEY is not set')
  process.exit(3)
}
const token = requireKey ? `E2E_KEYED_${key}` : 'E2E_MCP_OK'

const server = new Server(
  { name: 'e2e-probe-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'magic_token',
      description: 'Returns the e2e magic token. Call this when asked to call the magic_token tool.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === 'magic_token') {
    return { content: [{ type: 'text', text: token }] }
  }
  throw new Error(`Unknown tool: ${req.params.name}`)
})

await server.connect(new StdioServerTransport())
