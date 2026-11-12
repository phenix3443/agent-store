import { test, expect } from 'bun:test'
import { installCommand, runEntries } from '../install-preview'
import { mcpItem, providerItem } from '../../components/__tests__/fixtures'

test('install command uses the slug', () => {
  expect(installCommand(mcpItem)).toBe('aas install anki-mcp')
})

test('run entries disclose the stdio command and the install hook steps', () => {
  const entries = runEntries({
    ...mcpItem,
    installHook: { steps: [{ type: 'config', patch: { mcpServers: {} } }] },
  })
  expect(entries).toEqual([
    { kind: 'command', value: 'npx -y @ankimcp/anki-mcp-server' },
    { kind: 'config', value: 'mcpServers' },
  ])
})

test('a skill file listed in the install hook is not shown twice', () => {
  const url = 'https://example.com/SKILL.md'
  const entries = runEntries({
    ...providerItem,
    category: 'skill',
    contentUrl: url,
    installHook: { steps: [{ type: 'file', url, dest: 'skill.md' }] },
  } as never)
  expect(entries).toEqual([{ kind: 'download', value: url, dest: 'skill.md' }])
})
