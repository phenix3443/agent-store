import { test, expect, beforeEach, afterEach } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { detectAgents } from '../agents'
import { runDoctor } from '../doctor'
import { maskArgs } from '../import/redact'

let root: string
let paths: { aasHome: string; claudeConfigDir: string; claudeJsonPath: string; codexConfigDir: string }

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'as-agents-'))
  paths = { aasHome: join(root, 'as'), claudeConfigDir: join(root, 'claude'), claudeJsonPath: join(root, 'claude', '.claude.json'), codexConfigDir: join(root, 'codex') }
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function fakeCli(name: string, output: string): string {
  const bin = join(root, name)
  writeFileSync(bin, `#!/bin/sh\necho '${output}'\n`)
  chmodSync(bin, 0o755)
  return bin
}

test('an agent counts as detected by its CLI or its config directory, and reports the version', async () => {
  const claudeBin = fakeCli('claude', '2.1.80 (Claude Code)')
  mkdirSync(paths.codexConfigDir, { recursive: true })
  const [claude, codex] = await detectAgents(paths, { PATH: '', AS_CLAUDE_BIN: claudeBin, AS_CODEX_BIN: '' })
  expect(claude).toMatchObject({ agent: 'claude', binary: claudeBin, version: '2.1.80 (Claude Code)', configDirExists: false, detected: true })
  expect(codex).toMatchObject({ agent: 'codex', binary: null, version: null, configDirExists: true, mcpConfigExists: false, detected: true })

  const none = await detectAgents({ ...paths, codexConfigDir: join(root, 'nope') }, { PATH: '', AS_CLAUDE_BIN: '', AS_CODEX_BIN: '' })
  expect(none.map(a => a.detected)).toEqual([false, false])
})

test('doctor warns about agents something is enabled for but that are missing, or lack the CLI MCP writes use', async () => {
  mkdirSync(paths.aasHome, { recursive: true })
  mkdirSync(paths.codexConfigDir, { recursive: true })
  const entry = (slug: string, category: 'skill' | 'mcp', enabledFor: Record<string, boolean>) =>
    ({ slug, category, version: '1', installedAt: '', updatedAt: '', compatibleWith: ['claude', 'codex'], enabledFor })
  writeFileSync(join(paths.aasHome, 'registry.json'), JSON.stringify({ installed: [entry('m', 'mcp', { claude: true, codex: true })] }))
  const env = { PATH: '', AS_CLAUDE_BIN: '', AS_CODEX_BIN: '' }
  const codes = (await runDoctor(paths, { agents: true, env })).map(f => f.code).filter(c => c.startsWith('agent-'))
  expect(codes).toEqual(['agent-not-found', 'agent-cli-missing'])
  expect((await runDoctor(paths, { env })).some(f => f.code.startsWith('agent-'))).toBe(false)
})

test('secret-looking argument values are masked, the rest kept', () => {
  expect(maskArgs(['-y', '@scope/pkg@1.0.0', '--api-key', 'sk-123', '--token=abc', '--port=8080', 'https://h.example/x?k=v', 'ghp_aaaaaaaaaaaaaaaaaaaaaaaa1234'])).toEqual(
    ['-y', '@scope/pkg@1.0.0', '--api-key', '***', '--token=***', '--port=8080', 'https://h.example/x?k=***', '***'])
})
