import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { migrateLegacyHome } from '../migrate-legacy-home'

test('moves Agent Store files and packages while leaving shared skills in place', async () => {
  const root = await mkdtemp('/tmp/as-migrate-')
  const legacy = join(root, '.agents')
  const store = join(root, '.agent-store')
  try {
    await mkdir(join(legacy, 'packages', 'demo'), { recursive: true })
    await mkdir(join(legacy, 'skills', 'shared'), { recursive: true })
    await writeFile(join(legacy, 'registry.json'), '{}')
    await writeFile(join(legacy, 'packages', 'demo', 'agent-package.json'), '{}')
    await writeFile(join(legacy, 'skills', 'shared', 'SKILL.md'), '# Shared')

    await migrateLegacyHome(legacy, store)

    expect(await readFile(join(store, 'registry.json'), 'utf-8')).toBe('{}')
    expect(await readFile(join(store, 'packages', 'demo', 'agent-package.json'), 'utf-8')).toBe('{}')
    expect(await readFile(join(legacy, 'skills', 'shared', 'SKILL.md'), 'utf-8')).toBe('# Shared')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
