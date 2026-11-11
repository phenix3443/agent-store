import { test, expect } from 'bun:test'
import { installCommand, reviewVerdict, runEntries } from '../review'
import { cleanReview, flaggedReview, mcpItem, providerItem } from '../../components/__tests__/fixtures'

test('a package without review data is pending, not passed', () => {
  expect(reviewVerdict(providerItem)).toBe('pending')
})

test('only a low-risk review without concerns passes', () => {
  expect(reviewVerdict({ review: cleanReview })).toBe('passed')
  expect(reviewVerdict({ review: flaggedReview })).toBe('flagged')
  expect(reviewVerdict({ review: { ...cleanReview, concerns: ['x'] } })).toBe('flagged')
  expect(reviewVerdict({ review: { ...cleanReview, risk: 'high' } })).toBe('flagged')
})

test('install command uses the slug', () => {
  expect(installCommand(mcpItem)).toBe('agent-store add anki-mcp')
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
