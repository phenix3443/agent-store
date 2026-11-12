import { test, expect } from 'bun:test'
import type { McpResourceDetail } from '@as/types'
import { mcpResource, providerResource, skillResource, summary } from '../../components/__tests__/fixtures'
import {
  desktopSlug,
  idFromSegments,
  installCommand,
  leadSentence,
  parseStoreQuery,
  resourceHref,
  runEntries,
} from '../resource'

test('detail hrefs keep the id readable and round-trip through the route segments', () => {
  const href = resourceHref(skillResource)
  expect(href).toBe('/store/skill/github:obra/superpowers/brainstorming')
  const segments = href.split('/').slice(3)
  expect(idFromSegments(segments)).toBe(skillResource.id)
  expect(idFromSegments(['github%3Aobra', 'superpowers', 'brainstorming'])).toBe(skillResource.id)
  expect(resourceHref({ kind: 'skill', id: 'github:o/r/a b' })).toBe('/store/skill/github:o/r/a%20b')
})

test('the URL query is parsed defensively', () => {
  expect(parseStoreQuery({})).toEqual({ kind: null, q: '', sort: 'default' })
  expect(parseStoreQuery({ category: 'mcp', q: '  git ', sort: 'installs' })).toEqual({ kind: 'mcp', q: 'git', sort: 'installs' })
  expect(parseStoreQuery({ category: 'theme', sort: 'rating' })).toEqual({ kind: null, q: '', sort: 'default' })
  expect(parseStoreQuery({ sort: 'created' }).sort).toBe('updated')
  expect(parseStoreQuery({ q: 'x'.repeat(500) }).q.length).toBe(200)
})

test('install commands follow what each source supports', () => {
  expect(installCommand(skillResource)).toBe('npx skills add obra/superpowers --skill brainstorming')
  expect(installCommand(providerResource)).toBe('aas install openrouter')
  expect(installCommand(mcpResource)).toBe(
    'claude mcp add -e ANKI_TOKEN=<ANKI_TOKEN> anki-mcp-server -- npx -y @ankimcp/anki-mcp-server@0.8.0'
  )
  // A list row has no packages to build an MCP command from.
  expect(installCommand(summary(mcpResource))).toBeNull()
})

test('an MCP server with only a remote is added over HTTP, with its required headers', () => {
  const remoteOnly: McpResourceDetail = {
    ...mcpResource,
    packages: [],
    remotes: [
      {
        type: 'streamable-http',
        url: 'https://mcp.example.com/mcp',
        variables: {},
        headers: [
          { name: 'Authorization', description: null, isRequired: true, isSecret: true, default: null, value: 'Bearer {token}', placeholder: null, choices: [], format: null, variables: {} },
        ],
      },
    ],
  }
  expect(installCommand(remoteOnly)).toBe(
    "claude mcp add --transport http --header 'Authorization: Bearer {token}' anki-mcp-server https://mcp.example.com/mcp"
  )
  expect(runEntries(remoteOnly)).toEqual([{ kind: 'connect', value: 'https://mcp.example.com/mcp' }])
})

test('a PyPI and an OCI package launch the registry way', () => {
  const pkg = mcpResource.packages[0]!
  const pypi: McpResourceDetail = { ...mcpResource, packages: [{ ...pkg, registryType: 'pypi', identifier: 'mcp-x', version: '1.2', environmentVariables: [] }] }
  expect(installCommand(pypi)).toBe('claude mcp add anki-mcp-server -- uvx mcp-x==1.2')
  const oci: McpResourceDetail = { ...mcpResource, packages: [{ ...pkg, registryType: 'oci', identifier: 'ghcr.io/x/y:1', version: null }] }
  expect(runEntries(oci)[0]).toEqual({ kind: 'command', value: 'docker run -i --rm -e ANKI_TOKEN ghcr.io/x/y:1' })
})

test('what it runs: the launch and the inputs for MCP, the GitHub directory for a skill', () => {
  expect(runEntries(mcpResource)).toEqual([
    { kind: 'command', value: 'npx -y @ankimcp/anki-mcp-server@0.8.0' },
    { kind: 'needs', value: 'ANKI_TOKEN' },
  ])
  expect(runEntries(skillResource)).toEqual([
    { kind: 'files', value: 'obra/superpowers/skills/brainstorming', href: skillResource.repo.url },
  ])
  expect(runEntries(providerResource)).toEqual([{ kind: 'connect', value: 'https://openrouter.ai/api' }])
})

test('desktop slugs match the old catalog where both hold the package', () => {
  expect(desktopSlug(providerResource)).toBe('openrouter')
  expect(desktopSlug(skillResource)).toBe('superpowers-brainstorming')
  expect(desktopSlug(mcpResource)).toBe('anki-mcp-server')
  expect(desktopSlug({ kind: 'mcp', origin: { ...mcpResource.origin, upstreamId: 'io.x/***' } })).toBeNull()
})

test('listings show the first whole sentence', () => {
  expect(leadSentence('Create art in .png and .pdf documents. You should use this skill when asked.')).toBe(
    'Create art in .png and .pdf documents.'
  )
  expect(leadSentence('OpenRouter：一个 API Key 访问 300+ 模型（OpenAI 兼容）。此预设已填好接入地址。')).toBe(
    'OpenRouter：一个 API Key 访问 300+ 模型（OpenAI 兼容）。'
  )
  expect(leadSentence('')).toBe('')
})
