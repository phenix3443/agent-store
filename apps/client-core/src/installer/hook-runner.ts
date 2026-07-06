import { mkdir, writeFile, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import type { InstallHook, Item } from '@as/types'

export async function runHook(steps: InstallHook['steps'], itemDir: string): Promise<void> {
  await mkdir(itemDir, { recursive: true })
  for (const step of steps) {
    if (step.type === 'file') {
      const res = await fetch(step.url)
      if (!res.ok) throw new Error(`Failed to fetch ${step.url}: HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      const dest = join(itemDir, step.dest)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, Buffer.from(buf))
    } else if (step.type === 'config') {
      const configPath = join(itemDir, 'config.json')
      let existing: Record<string, unknown> = {}
      try {
        existing = JSON.parse(await readFile(configPath, 'utf-8')) as Record<string, unknown>
      } catch { /* file may not exist */ }
      await writeFile(configPath, JSON.stringify({ ...existing, ...step.patch }, null, 2))
    } else if (step.type === 'script') {
      const proc = Bun.spawn(['sh', '-c', step.command], { cwd: itemDir })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        throw new Error(`Script failed with exit code ${exitCode}: ${step.command}`)
      }
    }
  }
}

export async function writeManifest(itemDir: string, item: Item): Promise<void> {
  await mkdir(itemDir, { recursive: true })
  await writeFile(join(itemDir, 'manifest.json'), JSON.stringify(item, null, 2))
}
