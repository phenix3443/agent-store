import { test, expect } from 'bun:test'
import { codexUntrusted, envState, itemCount, missingKeys, relPath, trustSnippet } from '../projects'
import { looksAbsolute } from '../folderPicker'

const base = { id: 'p1', path: '/w/demo', name: 'demo', addedAt: '', exists: true, codexTrusted: false, skills: [], env: [] }
const loc = (agent: 'claude' | 'codex', scope: 'project' | 'local' = 'project') => ({
  agent, scope, file: '', managed: true, modified: false, active: false, overridesUser: false, env: [], missingEnv: [],
})
const mcp = (locations: ReturnType<typeof loc>[], missingEnv: string[] = []) => ({
  kind: 'mcp' as const, name: 'm', managed: true, agents: [], overridesUser: false, missingEnv, locations,
})

test('paths inside the project are shown relative to it', () => {
  expect(relPath({ path: '/w/demo' }, '/w/demo/.mcp.json')).toBe('.mcp.json')
  expect(relPath({ path: '/w/demo' }, '/w/demo')).toBe('.')
  expect(relPath({ path: '/w/demo' }, '/w/demo-other/.mcp.json')).toBe('/w/demo-other/.mcp.json')
  expect(relPath({ path: 'C:\\w\\demo' }, 'C:\\w\\demo\\.codex\\config.toml')).toBe('.codex\\config.toml')
  expect(relPath({ path: '/w/demo' }, '/home/u/.claude.json')).toBe('/home/u/.claude.json')
})

test('the trust snippet is a TOML key with quotes and backslashes escaped', () => {
  expect(trustSnippet('/w/demo')).toBe('[projects."/w/demo"]\ntrust_level = "trusted"')
  expect(trustSnippet('C:\\w\\a "b"')).toBe('[projects."C:\\\\w\\\\a \\"b\\""]\ntrust_level = "trusted"')
})

test('the Codex banner is only for an untrusted project that has Codex MCP entries', () => {
  expect(codexUntrusted({ ...base, mcps: [mcp([loc('codex')])] })).toBe(true)
  expect(codexUntrusted({ ...base, codexTrusted: true, mcps: [mcp([loc('codex')])] })).toBe(false)
  expect(codexUntrusted({ ...base, mcps: [mcp([loc('claude')])] })).toBe(false)
  expect(codexUntrusted({ ...base, exists: false, mcps: [mcp([loc('codex')])] })).toBe(false)
})

test('missing keys and the state of each variable', () => {
  const d = { mcps: [mcp([], ['A']), mcp([], ['A', 'B'])] }
  expect(missingKeys(d)).toEqual(['A', 'B'])
  expect(envState(d, { name: 'A', stored: false })).toBe('missing')
  expect(envState(d, { name: 'A', stored: true })).toBe('stored')
  expect(envState(d, { name: 'C', stored: false })).toBe('optional')
  expect(itemCount({ skills: [], mcps: d.mcps })).toBe(2)
})

test('only full paths are sent to the engine', () => {
  for (const p of ['/w/demo', '~/code/x', '~', 'C:\\code', 'D:/code', '\\\\server\\share']) expect(looksAbsolute(p)).toBe(true)
  for (const p of ['code/x', './x', '~user/x', '']) expect(looksAbsolute(p)).toBe(false)
})
