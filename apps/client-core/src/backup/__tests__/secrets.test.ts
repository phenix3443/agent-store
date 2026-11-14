import { test, expect } from 'bun:test'
import { excludedSkillFile, isSecretConfigKey, scanText, splitSecrets } from '../secrets'
import { splitRemoteCredentials } from '../git'

test('provider credentials and keys marked or named like secrets are kept local', () => {
  expect(isSecretConfigKey('apiKey', undefined, 'provider')).toBe(true)
  expect(isSecretConfigKey('apiKeys', undefined, 'provider')).toBe(true)
  expect(isSecretConfigKey('token', undefined, 'provider')).toBe(true)
  expect(isSecretConfigKey('baseUrl', undefined, 'provider')).toBe(false)
  expect(isSecretConfigKey('authType', undefined, 'provider')).toBe(false)
  expect(isSecretConfigKey('region', { 'x-secret': true }, 'mcp')).toBe(true)
  expect(isSecretConfigKey('auth', { 'x-bearer': true }, 'mcp')).toBe(true)
  expect(isSecretConfigKey('GITHUB_PERSONAL_ACCESS_TOKEN', undefined, 'mcp')).toBe(true)
  expect(isSecretConfigKey('OPENAI_API_KEY', undefined, 'mcp')).toBe(true)
  expect(isSecretConfigKey('db_password', undefined, 'mcp')).toBe(true)
  expect(isSecretConfigKey('region', { type: 'string' }, 'mcp')).toBe(false)
})

test('splitSecrets uses the schema', () => {
  const { shared, secret } = splitSecrets(
    { region: 'eu', API_KEY: 'k', pin: '1234' },
    { properties: { pin: { 'x-secret': true }, region: {} } }, 'mcp',
  )
  expect(shared).toEqual({ region: 'eu' })
  expect(secret).toEqual({ API_KEY: 'k', pin: '1234' })
})

test('scanText finds known values and key formats, not documentation placeholders', () => {
  expect(scanText('value=abcdefgh-123', [{ value: 'abcdefgh-123', source: 'the apiKey of x' }])).toEqual(['the apiKey of x'])
  expect(scanText(`token ghp_${'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0eF3hJ6'}`, [])).toEqual(['a GitHub token'])
  expect(scanText(`export OPENAI_API_KEY=sk-${'x'.repeat(48)}`, [])).toEqual([])
  expect(scanText('use sk-... here', [])).toEqual([])
  expect(scanText('-----BEGIN OPENSSH PRIVATE KEY-----\nabc', [])).toEqual(['a private key'])
})

test('secret-looking files inside skills are excluded', () => {
  expect(excludedSkillFile('.git', 0o755, true, true)).toBe('git-dir')
  expect(excludedSkillFile('sub/.env.local', 0o644, false, true)).toBe('secret-name')
  expect(excludedSkillFile('keys/server.pem', 0o644, false, true)).toBe('secret-name')
  expect(excludedSkillFile('notes.txt', 0o600, false, true)).toBe('owner-only')
  expect(excludedSkillFile('notes.txt', 0o600, false, false)).toBeNull()
  expect(excludedSkillFile('SKILL.md', 0o644, false, true)).toBeNull()
})

test('credentials in an HTTPS URL are split off; other remotes are left alone', () => {
  expect(splitRemoteCredentials('https://me:tok@example.com/r.git')).toEqual({
    remote: 'https://example.com/r.git', credentials: { username: 'me', password: 'tok' },
  })
  expect(splitRemoteCredentials('https://me@example.com/r.git')).toEqual({ remote: 'https://me@example.com/r.git' })
  expect(splitRemoteCredentials('git@github.com:me/r.git')).toEqual({ remote: 'git@github.com:me/r.git' })
})
