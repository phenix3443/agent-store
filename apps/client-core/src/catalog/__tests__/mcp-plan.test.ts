import { test, expect } from 'bun:test'
import type { McpArgument } from '@as/types'
import { planMcp, McpNotInstallableError } from '../mcp-plan'
import { emptyInput, mcpResource, npmPackage } from '../../__tests__/helpers/resources'

const arg = (over: Partial<McpArgument>): McpArgument => ({ ...emptyInput, type: 'positional', name: null, valueHint: null, isRepeated: false, variables: {}, ...over })

test('pypi runs through uvx with the pinned version', () => {
  const plan = planMcp(mcpResource('io.x/py', { packages: [npmPackage('mcp-py', { registryType: 'pypi', version: '0.3.0' })] }), 'py')
  expect(plan).toMatchObject({ transport: 'stdio', command: 'uvx', args: ['mcp-py==0.3.0'], env: {} })
})

test('oci runs through docker and forwards each env var by name', () => {
  const pkg = npmPackage('ghcr.io/x/server:1', {
    registryType: 'oci', version: null,
    environmentVariables: [{ ...emptyInput, name: 'API_KEY', isRequired: true, isSecret: true, variables: {} }],
  })
  const plan = planMcp(mcpResource('io.x/oci', { packages: [pkg] }), 'oci')
  expect(plan).toMatchObject({ command: 'docker', args: ['run', '-i', '--rm', '-e', 'API_KEY', 'ghcr.io/x/server:1'] })
  expect((plan.configSchema as { required: string[] }).required).toEqual(['API_KEY'])
})

test('a runtime hint names the launcher; runtime and package arguments keep their order', () => {
  const pkg = npmPackage('srv', {
    runtimeHint: 'bunx', version: null,
    runtimeArguments: [arg({ type: 'named', name: '--bun', value: 'true' })],
    packageArguments: [
      arg({ value: 'serve' }),
      arg({ type: 'named', name: '--port', default: '8080' }),
      arg({ type: 'named', name: '--root', isRequired: true, valueHint: 'root_dir' }),
      arg({ type: 'named', name: '--verbose' }),
      arg({ value: '--db={db_path}', variables: { db_path: { ...emptyInput, description: 'DB file' } } }),
    ],
  })
  const plan = planMcp(mcpResource('io.x/hint', { packages: [pkg] }), 'hint')
  expect(plan).toMatchObject({ command: 'bunx', args: ['--bun', 'true', 'srv', 'serve', '--port', '8080', '--root', '{root_dir}', '--db={db_path}'] })
  expect(plan.configSchema).toEqual({
    type: 'object',
    properties: {
      root_dir: { type: 'string', 'x-template': true, title: '--root' },
      db_path: { type: 'string', description: 'DB file', 'x-template': true },
    },
    required: ['root_dir', 'db_path'],
  })
})

test('a variable with a fixed value is inlined, not asked for', () => {
  const pkg = npmPackage('srv', {
    environmentVariables: [{ ...emptyInput, name: 'URL', value: 'https://{host}/api', variables: { host: { ...emptyInput, value: 'api.example.com' } } }],
  })
  const plan = planMcp(mcpResource('io.x/fixed', { packages: [pkg] }), 'fixed')
  expect(plan).toMatchObject({ env: { URL: 'https://api.example.com/api' }, configSchema: { type: 'object' } })
})

test('an npm package wins over a remote, a remote over a docker image, streamable-http over sse', () => {
  const remote = (type: string) => ({ type, url: `https://x/${type}`, variables: {}, headers: [] })
  const docker = npmPackage('img', { registryType: 'oci' })
  expect(planMcp(mcpResource('io.x/a', { packages: [docker, npmPackage('n')], remotes: [remote('streamable-http')] }), 'a').transport).toBe('stdio')
  expect(planMcp(mcpResource('io.x/b', { packages: [docker], remotes: [remote('sse'), remote('streamable-http')] }), 'b')).toMatchObject({ transport: 'http', url: 'https://x/streamable-http' })
  expect(planMcp(mcpResource('io.x/c', { remotes: [remote('sse')] }), 'c').transport).toBe('sse')
})

test('a package serving HTTP locally, or with no known launcher, is not installable', () => {
  const http = npmPackage('h', { transport: { type: 'streamable-http', url: 'http://localhost:3000', headers: [], variables: {} } })
  const err = (() => { try { planMcp(mcpResource('io.x/h', { packages: [http, npmPackage('m', { registryType: 'mcpb' })] }), 'h') } catch (e) { return e } })()
  expect(err).toBeInstanceOf(McpNotInstallableError)
  expect((err as McpNotInstallableError).reason).toBe('no-launcher')
  expect((err as Error).message).toContain('npm (streamable-http), mcpb (stdio)')
})
