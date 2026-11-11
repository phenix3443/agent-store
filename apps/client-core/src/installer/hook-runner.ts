import { mkdir, writeFile, readFile } from 'fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import type { InstallHook, Item } from '@as/types'

type Step = InstallHook['steps'][number]
type PlannedStep =
  | { type: 'file'; url: string; target: string }
  | { type: 'config'; patch: Record<string, unknown> }

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

function containedTarget(itemDir: string, dest: unknown): string {
  if (typeof dest === 'string') {
    const root = resolve(itemDir)
    const target = resolve(root, dest)
    const rel = relative(root, target)
    if (rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) return target
  }
  throw new Error(`Install hook file dest ${JSON.stringify(dest)} resolves outside the item directory`)
}

// Every step is validated before the first fetch or write, so a rejected hook leaves nothing behind.
function plan(steps: InstallHook['steps'], itemDir: string): PlannedStep[] {
  return steps.map((step: Step): PlannedStep => {
    const raw = step as Record<string, unknown>
    if (raw.type === 'script') {
      throw new Error('Install hook script steps are not supported; refusing to install this item')
    }
    if (raw.type === 'file') {
      if (typeof raw.url !== 'string' || !isHttps(raw.url)) {
        throw new Error(`Install hook file url must be https: ${String(raw.url)}`)
      }
      return { type: 'file', url: raw.url, target: containedTarget(itemDir, raw.dest) }
    }
    if (raw.type === 'config') {
      if (!raw.patch || typeof raw.patch !== 'object' || Array.isArray(raw.patch)) {
        throw new Error('Install hook config step needs an object patch')
      }
      return { type: 'config', patch: raw.patch as Record<string, unknown> }
    }
    throw new Error(`Unknown install hook step type: ${String(raw.type)}`)
  })
}

export async function runHook(steps: InstallHook['steps'], itemDir: string): Promise<void> {
  const planned = plan(steps, itemDir)
  await mkdir(itemDir, { recursive: true })
  for (const step of planned) {
    if (step.type === 'file') {
      const res = await fetch(step.url)
      if (!res.ok) throw new Error(`Failed to fetch ${step.url}: HTTP ${res.status}`)
      if (res.url && !isHttps(res.url)) {
        throw new Error(`Install hook file url must be https, got redirected to ${res.url}`)
      }
      const buf = await res.arrayBuffer()
      await mkdir(dirname(step.target), { recursive: true })
      await writeFile(step.target, Buffer.from(buf))
    } else {
      const configPath = join(itemDir, 'config.json')
      let existing: Record<string, unknown> = {}
      try {
        existing = JSON.parse(await readFile(configPath, 'utf-8')) as Record<string, unknown>
      } catch { /* file may not exist */ }
      // Patch values are defaults: reinstall and update must not reset what the user configured (e.g. apiKey).
      await writeFile(configPath, JSON.stringify({ ...step.patch, ...existing }, null, 2))
    }
  }
}

export async function writeManifest(itemDir: string, item: Item): Promise<void> {
  await mkdir(itemDir, { recursive: true })
  await writeFile(join(itemDir, 'manifest.json'), JSON.stringify(item, null, 2))
}
