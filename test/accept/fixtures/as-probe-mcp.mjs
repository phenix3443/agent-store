#!/usr/bin/env node
// Dependency-free stdio MCP server for scripts/accept-global.ts. It exposes one
// tool, `probe`, whose result proves the server Agent Store configured is the
// one the agent reached: a fixed token, the PROBE_TOKEN env value, and the argv
// the server was started with (so quoted arguments can be checked as one item).
// With `--exit-immediately` it exits before speaking MCP (the failing probe).
import { createInterface } from 'node:readline'

const argv = process.argv.slice(2)
if (argv.includes('--exit-immediately')) process.exit(3)

const TOKEN = 'AS_PROBE_MCP_OK'

function send(msg) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n')
}

function result(id, value) { send({ id, result: value }) }

const tools = [{
  name: 'probe',
  description: 'Returns the Agent Store acceptance probe token. Call it when asked to call the probe tool.',
  inputSchema: { type: 'object', properties: {} },
}]

createInterface({ input: process.stdin }).on('line', line => {
  let req
  try { req = JSON.parse(line) } catch { return }
  if (req.id === undefined) return // notification
  switch (req.method) {
    case 'initialize':
      return result(req.id, {
        protocolVersion: req.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'as-probe-mcp', version: '1.0.0' },
      })
    case 'ping':
      return result(req.id, {})
    case 'tools/list':
      return result(req.id, { tools })
    case 'tools/call': {
      if (req.params?.name !== 'probe') {
        return send({ id: req.id, error: { code: -32602, message: `Unknown tool: ${req.params?.name}` } })
      }
      const text = `${TOKEN} token=${process.env.PROBE_TOKEN ?? ''} argv=${JSON.stringify(argv)}`
      return result(req.id, { content: [{ type: 'text', text }] })
    }
    default:
      return send({ id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } })
  }
})
