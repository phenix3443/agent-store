// `as migrate`, part 2: retires what the removed agent-package prototype
// (AgentPackageEngine, reachable only from fixture scripts) left behind:
// ~/.agents/packages-registry.json, ~/.agents/packages/<id>/ and the tool entries it
// wrote under `<publisher>.<name>#<id>` (oldest) or `<publisher>-<name>-<id>`.
// Nothing manages those any more, so skills and MCP entries that are provably the
// prototype's are removed (backed up first). Provider settings are reported and left:
// the prototype kept no record of the values it replaced, so removing them could
// leave a tool with no working provider.
import { lstat, readdir, readFile, rm } from 'fs/promises'
import { join, relative, resolve, isAbsolute, sep } from 'path'
import { parse as parseToml } from '@iarna/toml'
import { assertSafeSlug } from './paths'
import { atomicWriteFile, readJsonObject } from './config/safe-file'
import { removeClaudeMcpServer } from './config/claude'
import { removeCodexMcpServer } from './config/codex'
import type { MigratePaths, MigrateStep } from './migrate'

type ToolTarget = 'claude' | 'codex'

interface Component {
  id: string
  type: 'provider' | 'skill' | 'mcpServer'
  targets?: Partial<Record<ToolTarget, unknown>>
  source?: { repo?: string; path?: string }
  transport?: 'stdio' | 'http' | 'sse'
  command?: string
  url?: string
  provider?: { baseUrlKey?: string }
}

interface PackageManifest {
  name: string
  publisher: { slug: string }
  components: Component[]
}

interface PackageEntry {
  packageId: string
  targets?: Partial<Record<ToolTarget, boolean>>
}

/** Called before anything is changed; `rel` is where the copy goes in the backup dir. */
export type BackupFn = (path: string, rel: string) => Promise<void>

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch { return false }
}

/** `child` inside `root`, or undefined when it would leave it. */
function contained(root: string, child: string): string | undefined {
  const target = resolve(root, child)
  const rel = relative(resolve(root), target)
  return rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) ? target : undefined
}

/** A real directory holding exactly one SKILL.md equal to `body`: what the prototype wrote. */
async function isPrototypeSkillCopy(dir: string, body: string | undefined): Promise<boolean> {
  if (body === undefined) return false
  try {
    if (!(await lstat(dir)).isDirectory()) return false
    const names = await readdir(dir)
    return names.length === 1 && names[0] === 'SKILL.md' && (await readFile(join(dir, 'SKILL.md'), 'utf-8')) === body
  } catch {
    return false
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export async function retirePackageInstalls(p: Required<MigratePaths>, backup: BackupFn): Promise<MigrateStep[]> {
  const steps: MigrateStep[] = []
  const registryPath = join(p.aasHome, 'packages-registry.json')
  let registry: { installedPackages: PackageEntry[] }
  try {
    const raw = await readJsonObject(registryPath)
    if (!raw) return steps
    if (!Array.isArray(raw['installedPackages'])) throw new Error('no "installedPackages" list')
    registry = raw as unknown as { installedPackages: PackageEntry[] }
  } catch (e) {
    return [{ slug: 'packages-registry.json', result: 'error', message: `${registryPath}: ${(e as Error).message}; left alone` }]
  }

  const codexToml = join(p.codexConfigDir, 'config.toml')
  const claudeSettings = join(p.claudeConfigDir, 'settings.json')
  const readClaudeMcp = async () => {
    const servers = (await readJsonObject(p.claudeJsonPath))?.['mcpServers']
    return isRecord(servers) ? servers : {}
  }
  const readCodex = async (): Promise<Record<string, unknown>> => {
    try { return parseToml(await readFile(codexToml, 'utf-8')) as Record<string, unknown> } catch { return {} }
  }

  const remaining: PackageEntry[] = []
  for (const entry of registry.installedPackages) {
    const id = String(entry?.packageId)
    const step = (result: MigrateStep['result'], message: string) => steps.push({ slug: id, result, message })
    let manifest: PackageManifest
    let packageDir: string
    try {
      packageDir = join(p.aasHome, 'packages', assertSafeSlug(id))
      manifest = JSON.parse(await readFile(join(packageDir, 'agent-package.json'), 'utf-8')) as PackageManifest
      assertSafeSlug(manifest.publisher.slug)
      assertSafeSlug(manifest.name)
      for (const c of manifest.components) assertSafeSlug(c.id)
    } catch (e) {
      step('error', `package left alone: ${(e as Error).message}`)
      remaining.push(entry)
      continue
    }

    let keep = false
    try {
      for (const target of ['claude', 'codex'] as const) {
        if (entry.targets?.[target] !== true) continue
        const toolDir = target === 'claude' ? p.claudeConfigDir : p.codexConfigDir
        for (const c of manifest.components) {
          if (c.targets?.[target] === undefined) continue
          const names = [`${id}#${c.id}`, `${manifest.publisher.slug}-${manifest.name}-${c.id}`]

          if (c.type === 'skill') {
            const sources = join(packageDir, 'sources')
            const source = c.source?.repo && c.source.path ? contained(sources, join(c.source.repo, c.source.path)) : undefined
            const body = source ? await readFile(source, 'utf-8').catch(() => undefined) : undefined
            for (const name of names) {
              const dir = join(toolDir, 'skills', name)
              if (!(await exists(dir))) continue
              if (!(await isPrototypeSkillCopy(dir, body))) {
                step('skipped', `${dir} differs from the package's skill, so it is treated as the user's and left alone`)
                keep = true
                continue
              }
              await backup(dir, join('packages', target, 'skills', name))
              await rm(dir, { recursive: true })
              step('done', `${dir}: removed (a copy is in the backup)`)
            }
          } else if (c.type === 'mcpServer') {
            const expected = (e: unknown) => isRecord(e) && (c.transport === 'stdio'
              ? typeof c.command === 'string' && e['command'] === (c.command.startsWith('.') ? resolve(packageDir, c.command) : c.command)
              : e['url'] === c.url)
            for (const name of names) {
              const servers = target === 'claude' ? await readClaudeMcp() : ((await readCodex())['mcp_servers'] ?? {}) as Record<string, unknown>
              if (!(name in servers)) continue
              const where = target === 'claude' ? `${p.claudeJsonPath} mcpServers["${name}"]` : `${codexToml} mcp_servers."${name}"`
              if (!expected(servers[name])) {
                step('skipped', `${where} differs from the package's server, so it is treated as the user's and left alone`)
                keep = true
                continue
              }
              if (target === 'claude') {
                await backup(p.claudeJsonPath, 'packages/claude/.claude.json')
                await removeClaudeMcpServer(p.claudeJsonPath, name)
              } else {
                await backup(codexToml, 'packages/codex/config.toml')
                await removeCodexMcpServer(p.codexConfigDir, name)
              }
              step('done', `${where}: removed (a copy of the file is in the backup)`)
            }
          } else if (c.type === 'provider') {
            let where: string | undefined
            if (target === 'claude') {
              const config = await readFile(join(packageDir, 'package-config.json'), 'utf-8').then(JSON.parse).catch(() => ({}))
              const baseUrl = isRecord(config[c.id]) ? config[c.id][c.provider?.baseUrlKey ?? 'baseUrl'] : undefined
              const env = (await readJsonObject(claudeSettings))?.['env']
              if (baseUrl !== undefined && isRecord(env) && env['ANTHROPIC_BASE_URL'] === baseUrl) {
                where = `${claudeSettings} env.ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN`
              }
            } else {
              const providers = (await readCodex())['model_providers']
              const found = isRecord(providers) ? names.filter(n => n in providers) : []
              if (found.length) where = `${codexToml} model_providers ${found.map(n => `"${n}"`).join(', ')}`
            }
            if (where) step('skipped', `${where}: set by this package's provider; left in place because nothing recorded what it replaced. Remove it by hand if you no longer use it`)
          }
        }
      }
    } catch (e) {
      step('error', (e as Error).message)
      keep = true
    }

    if (keep) {
      remaining.push(entry)
      continue
    }
    if (await exists(packageDir)) {
      await backup(packageDir, join('packages', 'store', id))
      await rm(packageDir, { recursive: true, force: true })
    }
    step('done', `${packageDir}: package retired; its files are in the backup`)
  }

  if (remaining.length === registry.installedPackages.length) return steps
  if (remaining.length === 0) {
    await backup(registryPath, 'packages/packages-registry.json')
    await rm(registryPath, { force: true })
  } else {
    await atomicWriteFile(registryPath, JSON.stringify({ installedPackages: remaining }, null, 2))
  }
  return steps
}
