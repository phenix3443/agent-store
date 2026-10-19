import { test, expect } from 'bun:test'
import { homedir } from 'os'
import { join } from 'path'
import { itemDir, resolvePaths } from '../paths'
import { catalogCachePath } from '../catalog-cache'
import { entitlementCachePath } from '../entitlement'

test('Agent Store defaults to ~/.agent-store and shares only installed skills', () => {
  const storeHome = join(homedir(), '.agent-store')
  const { aasHome } = resolvePaths()
  expect(aasHome).toBe(storeHome)
  expect(catalogCachePath(aasHome)).toBe(join(storeHome, 'catalog-cache.json'))
  expect(entitlementCachePath(aasHome)).toBe(join(storeHome, 'entitlement.json'))
  expect(itemDir(aasHome, 'skill', 'example')).toBe(join(homedir(), '.agents', 'skills', 'example'))
  expect(itemDir(aasHome, 'provider', 'example')).toBe(join(storeHome, 'providers', 'example'))
  expect(itemDir(aasHome, 'mcp', 'example')).toBe(join(storeHome, 'mcps', 'example'))
})

test('app data stays in an explicit AS_HOME', () => {
  expect(resolvePaths({ aasHome: '/tmp/agent-store-test' }).aasHome).toBe('/tmp/agent-store-test')
  expect(itemDir('/tmp/agent-store-test', 'skill', 'example')).toBe('/tmp/agent-store-test/skills/example')
})
