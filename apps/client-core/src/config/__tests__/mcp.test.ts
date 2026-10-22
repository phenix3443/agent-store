import { expect, test } from 'bun:test'
import type { MCPItem } from '@as/types'
import { buildMcpServerSpec, McpConfigMissingError, splitCommandLine, toClaudeEntry } from '../mcp'

test('splitCommandLine: plain words', () => {
  expect(splitCommandLine('npx -y @upstash/context7-mcp')).toEqual(['npx', '-y', '@upstash/context7-mcp'])
})

test('splitCommandLine: quotes and escapes, no expansion', () => {
  expect(splitCommandLine(`node "/tmp/probe dir/s.mjs" --greeting "hello world" 'it''s' a\\ b "q\\"x" '$HOME'`))
    .toEqual(['node', '/tmp/probe dir/s.mjs', '--greeting', 'hello world', 'its', 'a b', 'q"x', '$HOME'])
  expect(splitCommandLine(`run "" x`)).toEqual(['run', '', 'x'])
})

test('splitCommandLine: rejects unbalanced quotes and shell operators', () => {
  for (const bad of [`node "a`, `node 'a`, 'a | b', 'a && b', 'a; b', 'a > f', 'a < f', 'echo $(id)', 'echo `id`', 'echo "$(id)"', 'x\\']) {
    expect(() => splitCommandLine(bad)).toThrow()
  }
  // Quoted operators are just characters.
  expect(splitCommandLine(`grep "a|b" 'x;y'`)).toEqual(['grep', 'a|b', 'x;y'])
})

const base = {
  id: 'i', slug: 'probe', name: 'p', description: '', version: '1', compatibleWith: ['claude', 'codex'] as Array<'claude' | 'codex'>,
  tags: [], downloads: 0, rating: 0, status: 'published' as const, createdAt: '', updatedAt: '',
  installHook: { steps: [] }, category: 'mcp' as const,
  publisher: { id: 'p', slug: 'p', name: 'p', avatarUrl: '', tier: 'community' as const },
}

function stdio(serverCommand: string, configSchema: Record<string, unknown> = {}, extra: object = {}): MCPItem {
  return { ...base, compatibleWith: ['claude', 'codex'], transport: 'stdio', serverCommand, configSchema, ...extra } as MCPItem
}

test('stdio spec: tokenized argv, relative command resolved against the item dir', () => {
  expect(buildMcpServerSpec(stdio('./server --x "a b"'), '/items/probe', {})).toEqual({
    transport: 'stdio', command: '/items/probe/server', args: ['--x', 'a b'], env: {},
  })
})

test('stdio spec: structured command/args are used as given', () => {
  const m = stdio('ignored "', {}, { command: 'node', args: ['a b', '--c'] })
  expect(buildMcpServerSpec(m, '/d', {})).toMatchObject({ command: 'node', args: ['a b', '--c'] })
})

const schema = {
  type: 'object',
  properties: {
    probe_token: { type: 'string', 'x-env': 'PROBE_TOKEN' },
    region: { type: 'string' },
  },
  required: ['probe_token'],
}

test('config binds to env (x-env or UPPER_SNAKE of the key)', () => {
  const spec = buildMcpServerSpec(stdio('node s.js', schema), '/d', { probe_token: 'tok 1', region: 'eu' })
  expect(spec).toMatchObject({ env: { PROBE_TOKEN: 'tok 1', REGION: 'eu' } })
})

test('a missing required value fails before anything is written', () => {
  expect(() => buildMcpServerSpec(stdio('node s.js', schema), '/d', {})).toThrow(McpConfigMissingError)
  expect(() => buildMcpServerSpec(stdio('node s.js', schema), '/d', { probe_token: '' })).toThrow(/as config probe/)
})

test('values with a newline are rejected', () => {
  expect(() => buildMcpServerSpec(stdio('node s.js', schema), '/d', { probe_token: 'a\nb' })).toThrow(/newline/)
})

test('http: {key} placeholders in the url, x-bearer becomes a bearer token', () => {
  const m = {
    ...base, transport: 'http', url: 'https://x.example/{project_slug}/mcp',
    configSchema: { properties: { project_slug: { type: 'string' }, api_key: { type: 'string', 'x-bearer': true, 'x-env': 'X_API_KEY' } }, required: ['project_slug'] },
  } as MCPItem
  const spec = buildMcpServerSpec(m, '/d', { project_slug: 'demo', api_key: 'sk-1' })
  expect(spec).toEqual({ transport: 'http', url: 'https://x.example/demo/mcp', headers: {}, bearer: { env: 'X_API_KEY', value: 'sk-1' } })
  expect(toClaudeEntry(spec)).toEqual({ type: 'http', url: 'https://x.example/demo/mcp', headers: { Authorization: 'Bearer sk-1' } })
})

test('claude entry: stdio keeps argv items, env only when set', () => {
  expect(toClaudeEntry({ transport: 'stdio', command: 'node', args: ['a b'], env: {} })).toEqual({ type: 'stdio', command: 'node', args: ['a b'] })
  expect(toClaudeEntry({ transport: 'stdio', command: 'node', args: [], env: { K: 'v' } })).toEqual({ type: 'stdio', command: 'node', args: [], env: { K: 'v' } })
})
