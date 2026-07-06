import { cp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { AASPaths } from '@as/types'
import { upsertClaudeMcpServer } from './config/claude'
import { buildPackageStdioMcpServerConfig } from './config/mcp'
import { upsertCodexMcpServer, upsertCodexProviderConnection } from './config/codex'
import { resolvePaths } from './paths'

type ToolTarget = 'claude' | 'codex'

type TargetBinding = true | {
  adapter?: string
  config?: Record<string, unknown>
}

interface BaseComponent {
  id: string
  type: 'provider' | 'skill' | 'mcpServer'
  version: string
  name?: string
  description?: string
  targets: Partial<Record<ToolTarget, TargetBinding>>
}

interface ProviderComponent extends BaseComponent {
  type: 'provider'
  configSchema: Record<string, unknown>
  models?: string[]
  provider: {
    baseUrlKey?: string
  }
}

interface SkillComponent extends BaseComponent {
  type: 'skill'
  source: {
    repo: string
    ref?: string
    path: string
    format?: 'markdown' | 'yaml' | 'text'
  }
}

interface McpServerComponent extends BaseComponent {
  type: 'mcpServer'
  transport: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  cwd?: string
  envSchema?: {
    type?: 'object'
    properties?: Record<string, unknown>
  }
  url?: string
  headers?: Record<string, string>
}

type AgentPackageComponent = ProviderComponent | SkillComponent | McpServerComponent

interface AgentPackageManifest {
  schemaVersion: 1 | 2 | 3
  name: string
  displayName: string
  version: string
  description: string
  publisher: {
    slug: string
    name: string
  }
  categories?: string[]
  keywords?: string[]
  components: AgentPackageComponent[]
}

interface LocalPackageRegistryEntry {
  packageId: string
  packageDir: string
  version: string
  installedAt: string
  updatedAt: string
  targets: Partial<Record<ToolTarget, boolean>>
}

interface LocalPackageRegistry {
  installedPackages: LocalPackageRegistryEntry[]
}

function packageIdOf(manifest: AgentPackageManifest): string {
  return `${manifest.publisher.slug}.${manifest.name}`
}

function componentRef(manifest: AgentPackageManifest, component: AgentPackageComponent): string {
  return `${packageIdOf(manifest)}#${component.id}`
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf-8')) as T
}

async function readRegistry(aasHome: string): Promise<LocalPackageRegistry> {
  try {
    return await readJson<LocalPackageRegistry>(join(aasHome, 'packages-registry.json'))
  } catch {
    return { installedPackages: [] }
  }
}

async function writeRegistry(aasHome: string, registry: LocalPackageRegistry): Promise<void> {
  await mkdir(aasHome, { recursive: true })
  await writeFile(join(aasHome, 'packages-registry.json'), JSON.stringify(registry, null, 2))
}

async function readPackageManifest(packageDir: string): Promise<AgentPackageManifest> {
  return readJson<AgentPackageManifest>(join(packageDir, 'agent-package.json'))
}

async function readPackageConfig(packageDir: string): Promise<Record<string, unknown>> {
  try {
    return await readJson<Record<string, unknown>>(join(packageDir, 'package-config.json'))
  } catch {
    return {}
  }
}

async function writePackageConfig(packageDir: string, values: Record<string, unknown>): Promise<void> {
  await writeFile(join(packageDir, 'package-config.json'), JSON.stringify(values, null, 2))
}

async function readClaudeSettings(claudeConfigDir: string): Promise<Record<string, unknown>> {
  try {
    return await readJson<Record<string, unknown>>(join(claudeConfigDir, 'settings.json'))
  } catch {
    return {}
  }
}

async function writeClaudeSettings(claudeConfigDir: string, settings: Record<string, unknown>): Promise<void> {
  await mkdir(claudeConfigDir, { recursive: true })
  await writeFile(join(claudeConfigDir, 'settings.json'), JSON.stringify(settings, null, 2))
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function bindingEnabled(binding: TargetBinding | undefined): boolean {
  return binding !== undefined
}

function providerAdapterFor(target: ToolTarget, binding: TargetBinding | undefined): string {
  if (binding && binding !== true && binding.adapter) return binding.adapter
  return target === 'claude' ? 'anthropic-compatible-provider' : 'openai-compatible-provider'
}

function skillAdapterFor(binding: TargetBinding | undefined): string {
  if (binding && binding !== true && binding.adapter) return binding.adapter
  return 'skill-file'
}

function mcpAdapterFor(binding: TargetBinding | undefined): string {
  if (binding && binding !== true && binding.adapter) return binding.adapter
  return 'mcp-server'
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter((item): item is string => typeof item === 'string')
  return strings.length === value.length ? strings : undefined
}

function resolveMcpEnv(
  component: McpServerComponent,
  packageConfig: Record<string, unknown>
): Record<string, string> | undefined {
  const raw = packageConfig[component.id]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const values = raw as Record<string, unknown>
  const propertyNames = Object.keys(component.envSchema?.properties ?? {})
  const env: Record<string, string> = {}
  const keys = propertyNames.length > 0 ? propertyNames : Object.keys(values)
  for (const key of keys) {
    const value = readString(values[key])
    if (value !== undefined) env[key] = value
  }
  return Object.keys(env).length > 0 ? env : undefined
}

export class AgentPackageEngine {
  private readonly paths: Required<AASPaths>

  constructor(pathOverrides?: Partial<AASPaths>) {
    this.paths = resolvePaths(pathOverrides)
  }

  async installFromPath(sourceDir: string): Promise<{ packageId: string; packageDir: string }> {
    const manifest = await readPackageManifest(sourceDir)
    const packageId = packageIdOf(manifest)
    const destDir = join(this.paths.aasHome, 'packages', packageId)
    await rm(destDir, { recursive: true, force: true })
    await mkdir(join(this.paths.aasHome, 'packages'), { recursive: true })
    await cp(sourceDir, destDir, { recursive: true })

    const registry = await readRegistry(this.paths.aasHome)
    const now = new Date().toISOString()
    const next = registry.installedPackages.filter(item => item.packageId !== packageId)
    next.push({
      packageId,
      packageDir: destDir,
      version: manifest.version,
      installedAt: now,
      updatedAt: now,
      targets: {},
    })
    await writeRegistry(this.paths.aasHome, { installedPackages: next })
    return { packageId, packageDir: destDir }
  }

  async setPackageConfig(packageId: string, values: Record<string, unknown>): Promise<void> {
    const packageDir = join(this.paths.aasHome, 'packages', packageId)
    await writePackageConfig(packageDir, values)
  }

  async enablePackage(packageId: string, target: ToolTarget): Promise<void> {
    const packageDir = join(this.paths.aasHome, 'packages', packageId)
    const manifest = await readPackageManifest(packageDir)
    const packageConfig = await readPackageConfig(packageDir)

    for (const component of manifest.components) {
      const binding = component.targets[target]
      if (!bindingEnabled(binding)) continue
      if (component.type === 'provider') {
        await this.validateProviderComponent(component, packageConfig)
      } else if (component.type === 'skill') {
        await this.validateSkillComponent(manifest, component, target)
      } else {
        await this.validateMcpServerComponent(manifest, component, packageConfig, target)
      }
    }

    for (const component of manifest.components) {
      const binding = component.targets[target]
      if (!bindingEnabled(binding)) continue
      if (component.type === 'provider') {
        await this.syncProviderComponent(manifest, component, packageConfig, target)
      } else if (component.type === 'skill') {
        await this.syncSkillComponent(manifest, component, target)
      } else {
        await this.syncMcpServerComponent(manifest, component, packageConfig, target)
      }
    }

    const registry = await readRegistry(this.paths.aasHome)
    const now = new Date().toISOString()
    await writeRegistry(this.paths.aasHome, {
      installedPackages: registry.installedPackages.map(item =>
        item.packageId === packageId
          ? { ...item, updatedAt: now, targets: { ...item.targets, [target]: true } }
          : item
      ),
    })
  }

  private async validateProviderComponent(
    component: ProviderComponent,
    packageConfig: Record<string, unknown>
  ): Promise<void> {
    const componentConfig = (packageConfig[component.id] ?? {}) as Record<string, unknown>
    const apiKey = readString(componentConfig['apiKey'])
    const baseUrlKey = component.provider.baseUrlKey ?? 'baseUrl'
    const baseUrl = readString(componentConfig[baseUrlKey])
    if (!apiKey || !baseUrl) throw new Error(`Missing provider config for ${component.id}`)
  }

  private async validateSkillComponent(
    manifest: AgentPackageManifest,
    component: SkillComponent,
    target: ToolTarget
  ): Promise<void> {
    const adapter = skillAdapterFor(component.targets[target])
    if (adapter !== 'skill-file') throw new Error(`Unsupported skill adapter: ${adapter}`)
    const packageDir = join(this.paths.aasHome, 'packages', packageIdOf(manifest))
    const sourcePath = join(packageDir, 'sources', component.source.repo, component.source.path)
    await readFile(sourcePath, 'utf-8')
  }

  private async validateMcpServerComponent(
    manifest: AgentPackageManifest,
    component: McpServerComponent,
    packageConfig: Record<string, unknown>,
    target: ToolTarget
  ): Promise<void> {
    const adapter = mcpAdapterFor(component.targets[target])
    if (adapter !== 'mcp-server') throw new Error(`Unsupported mcp adapter: ${adapter}`)
    const packageDir = join(this.paths.aasHome, 'packages', packageIdOf(manifest))

    if (component.transport === 'stdio') {
      if (!component.command) throw new Error(`Missing MCP command for ${component.id}`)
      buildPackageStdioMcpServerConfig({
        command: component.command,
        args: readStringArray(component.args) ?? component.args ?? [],
        cwd: component.cwd,
        env: resolveMcpEnv(component, packageConfig),
        packageDir,
      })
      return
    }

    if (!component.url) throw new Error(`Missing MCP url for ${componentRef(manifest, component)}`)
  }

  private async syncProviderComponent(
    manifest: AgentPackageManifest,
    component: ProviderComponent,
    packageConfig: Record<string, unknown>,
    target: ToolTarget
  ): Promise<void> {
    await this.validateProviderComponent(component, packageConfig)
    const componentConfig = (packageConfig[component.id] ?? {}) as Record<string, unknown>
    const apiKey = readString(componentConfig['apiKey']) as string
    const baseUrlKey = component.provider.baseUrlKey ?? 'baseUrl'
    const baseUrl = readString(componentConfig[baseUrlKey]) as string

    if (target === 'claude') {
      const settings = await readClaudeSettings(this.paths.claudeConfigDir)
      const env = (settings['env'] ?? {}) as Record<string, unknown>
      env['ANTHROPIC_AUTH_TOKEN'] = apiKey
      env['ANTHROPIC_BASE_URL'] = baseUrl
      settings['env'] = env
      await writeClaudeSettings(this.paths.claudeConfigDir, settings)
      return
    }

    const providerKey = componentRef(manifest, component)
    await upsertCodexProviderConnection(this.paths.codexConfigDir, {
      providerKey,
      name: component.name ?? component.id,
      baseUrl,
      apiKey,
      adapter: providerAdapterFor('codex', component.targets.codex),
      model: component.models?.[0],
    })
  }

  private async syncSkillComponent(
    manifest: AgentPackageManifest,
    component: SkillComponent,
    target: ToolTarget
  ): Promise<void> {
    await this.validateSkillComponent(manifest, component, target)
    const packageDir = join(this.paths.aasHome, 'packages', packageIdOf(manifest))
    const sourcePath = join(packageDir, 'sources', component.source.repo, component.source.path)
    const content = await readFile(sourcePath, 'utf-8')
    const destDir = target === 'claude'
      ? join(this.paths.claudeConfigDir, 'skills')
      : join(this.paths.codexConfigDir, 'skills')
    await mkdir(destDir, { recursive: true })
    await writeFile(join(destDir, `${componentRef(manifest, component)}.md`), content)
  }

  private async syncMcpServerComponent(
    manifest: AgentPackageManifest,
    component: McpServerComponent,
    packageConfig: Record<string, unknown>,
    target: ToolTarget
  ): Promise<void> {
    await this.validateMcpServerComponent(manifest, component, packageConfig, target)
    const slug = componentRef(manifest, component)
    const packageDir = join(this.paths.aasHome, 'packages', packageIdOf(manifest))

    if (component.transport === 'stdio') {
      const entry = buildPackageStdioMcpServerConfig({
        command: component.command as string,
        args: readStringArray(component.args) ?? component.args ?? [],
        cwd: component.cwd,
        env: resolveMcpEnv(component, packageConfig),
        packageDir,
      })
      if (target === 'claude') {
        await upsertClaudeMcpServer(this.paths.claudeConfigDir, slug, entry)
      } else {
        await upsertCodexMcpServer(this.paths.codexConfigDir, slug, entry)
      }
      return
    }

    const entry = {
      type: component.transport,
      url: component.url as string,
      ...(component.headers ? { headers: component.headers } : {}),
    }
    if (target === 'claude') {
      await upsertClaudeMcpServer(this.paths.claudeConfigDir, slug, entry)
    } else {
      await upsertCodexMcpServer(this.paths.codexConfigDir, slug, entry)
    }
  }
}
