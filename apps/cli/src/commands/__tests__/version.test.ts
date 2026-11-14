import { test, expect } from 'bun:test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const entry = join(import.meta.dir, '..', '..', 'index.ts')

for (const flag of ['--version', '-V']) {
  test(`aas ${flag} prints the version and exits 0`, () => {
    const home = mkdtempSync(join(tmpdir(), 'aas-version-'))
    const r = Bun.spawnSync(['bun', entry, flag], { env: { ...process.env, HOME: home, AS_HOME: join(home, 'as') } })
    expect(r.exitCode).toBe(0)
    expect(r.stdout.toString().trim()).toBe('aas dev')
  })
}
