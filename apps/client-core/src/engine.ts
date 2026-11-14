import { readFile, rm } from 'fs/promises'
import { join } from 'path'
import type {
  Engine, Paths, InstallResult, SyncResult, UpdateAvailable, UpdateResult,
  ListOptions, InstalledItem, ItemDetail, ToolTarget, SearchOptions, JsonSchema,
  CatalogSearchResult, CatalogResourceDetail, ResourceKind, SkillDeployment,
  EnableOptions, DisableOptions, UninstallOptions, InstallOptions,
  InstallOutcome, TargetStatus, EnableBlocker,
  UsageSummaryRow, UsageSummaryOptions, LocalRelayConfig,
  RecentRequestRow, RelayStatus, ProviderHealth, ProviderTestResult, Entitlements, BudgetConfig, BudgetStatus,
  AddProjectOptions, Project, ProjectDetail, ProjectInstallOptions, ProjectInstallResult,
  ProjectUninstallOptions, ProjectUninstallResult,
  BackupConflictChoice, BackupConnectOptions, BackupConnectResult, BackupHistoryEntry, BackupResolveResult,
  BackupRestoreResult, BackupSnapshot, BackupStatus, BackupSyncResult,
} from '@as/types'
import { StoreClient } from '@as/sdk'
import { resolvePaths, itemDir, assertSafeSlug, type Category } from './paths'
import { ResourceCatalog, toItem, type Catalog } from './catalog'
import { resourceLongSlug } from '@as/types'
import { readRegistry, updateRegistry, patchEntry, findEntry, upsertEntry, removeEntry, setDeploymentRecord, setEnabledFlag } from './registry/index'
import { createAdapters, type KindAdapter } from './adapters'
import { ProjectService } from './projects/service'
import { BackupService } from './backup/service'
import { checkUpdates as _checkUpdates, latestFor } from './updater/index'
import { duplicateProviderConnection, readProviderConnection } from './config/provider'
import { claudeUsesRelay } from './config/claude'
import { codexUsesRelay } from './config/codex'
import { testProviderConnection } from './relay/provider-test'
import { atomicWriteSecretFile } from './config/safe-file'
import { getDailySummary, getRecentRequests } from './usage/queries'
import { readProviderHealth, resetProviderHealth } from './usage/provider-health'
import { exportUsageToFile } from './usage/export'
import { resolveEntitlements, entitlementsForPlan, writeEntitlementCache } from './entitlement/index'
import { readBudget, writeBudget, getBudgetStatus } from './usage/budget'
import { getRelayDaemonStatus, waitForRelayStatus } from './relay/daemon-status'
import {
  listLocalConfigs as _listLocalConfigs, addLocalConfig as _addLocalConfig,
  removeLocalConfig as _removeLocalConfig, updateLocalConfig as _updateLocalConfig,
  toggleLocalConfig as _toggleLocalConfig,
} from './relay/local-configs'

export { ProviderNotReadyError } from './adapters'

export class IncompatibleTargetError extends Error {
  constructor(slug: string, readonly target: ToolTarget, compatibleWith: ToolTarget[]) {
    super(`${slug} does not support ${target} (it supports: ${compatibleWith.join(', ') || 'none'})`)
    this.name = 'IncompatibleTargetError'
  }
}

export class UpdateFailedError extends Error {
  constructor(readonly updated: UpdateResult[], readonly failures: Array<{ slug: string; error: string }>) {
    super(`Update failed for ${failures.map(f => `${f.slug} (${f.error})`).join('; ')}; those items keep their previous version`)
    this.name = 'UpdateFailedError'
  }
}

const TARGETS: ToolTarget[] = ['claude', 'codex']

export interface EngineOptions {
  /** Starts the local relay daemon; without it, enabling a provider needs a relay that is already running. */
  startRelay?: () => Promise<void>
  /** Stops the local relay daemon and returns once it has exited. */
  stopRelay?: () => Promise<void>
  /** Used by testProvider; the global fetch by default. */
  fetchImpl?: typeof fetch
  /** Where install and search read from; /api/resources on `storeUrl` by default. */
  catalog?: Catalog
  /** Skills larger than this stay out of the backup; 100 MB by default. */
  backupMaxItemBytes?: number
}

/**
 * The shared flow for every kind of item: registry entry (locked, atomic), compatibility,
 * install/enable policy, config.json, update and rollback, errors. What a kind writes
 * and where is its adapter's business (adapters/).
 */
export class EngineImpl implements Engine {
  private readonly paths: Required<Paths>
  private readonly client: StoreClient
  private readonly adapters: Record<Category, KindAdapter>
  private readonly catalog: Catalog
  private readonly projects: ProjectService
  private readonly options: EngineOptions
  private readonly backup: BackupService

  constructor(pathOverrides?: Partial<Paths>, storeUrl?: string, options: EngineOptions = {}) {
    this.paths = resolvePaths(pathOverrides)
    this.options = options
    this.client = new StoreClient(storeUrl, { timeoutMs: 8000 })
    this.catalog = options.catalog ?? new ResourceCatalog(this.client, this.paths.aasHome)
    this.projects = new ProjectService(this.paths, this.catalog)
    this.backup = new BackupService(this.paths, {
      engine: this,
      engineFor: catalog => new EngineImpl(this.paths, storeUrl, { ...options, catalog }),
      maxItemBytes: options.backupMaxItemBytes,
    })
    this.adapters = createAdapters({
      paths: this.paths,
      startRelay: options.startRelay,
      setEnabled: (slug, target, enabled) => this._setEnabled(slug, target, enabled),
      setDeployment: (slug, target, record) => this._setDeployment(slug, target, record),
    })
  }

  private adapter(category: Category): KindAdapter {
    const adapter = this.adapters[category]
    if (!adapter) throw new Error(`Unknown item category: ${String(category)}`)
    return adapter
  }

  private async _entry(slug: string): Promise<InstalledItem> {
    const entry = findEntry(await readRegistry(this.paths.aasHome), slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    return entry
  }

  async search(query: string, options?: SearchOptions): Promise<CatalogSearchResult> {
    return this.catalog.search(query, options)
  }

  async getResource(ref: string, options: { kind?: ResourceKind } = {}): Promise<CatalogResourceDetail> {
    const installed = ref.includes(':') ? undefined : findEntry(await readRegistry(this.paths.aasHome), ref)
    const detail = installed?.resourceId
      ? await this.catalog.get(installed.resourceId)
      : await this.catalog.get(ref, installed ? { kind: installed.category } : options)
    const slug = installed?.slug ?? detail.slug ?? resourceLongSlug(detail)
    try {
      if (!slug) throw new Error(`${detail.id} has no usable local name`)
      return { ...detail, install: toItem(detail, slug) }
    } catch (e) {
      return { ...detail, installError: e instanceof Error ? e.message : String(e) }
    }
  }

  /**
   * `ref` is a catalog id or a slug. An installed slug reinstalls what it was
   * installed from. A new resource gets its short slug unless another resource
   * already holds it, then its long one.
   */
  async install(ref: string, options: InstallOptions = {}): Promise<InstallResult> {
    if (!ref.includes(':')) assertSafeSlug(ref)
    const before = await readRegistry(this.paths.aasHome)
    const byRef = ref.includes(':') ? undefined : findEntry(before, ref)
    const source = await this.catalog.resolveItem(byRef?.resourceId ?? ref, byRef ? { kind: byRef.category } : {})
    const byResource = source.resourceId ? before.installed.find(e => e.resourceId === source.resourceId) : undefined
    let slug = byResource?.slug ?? source.item.slug
    const holder = findEntry(before, slug)
    if (!byResource && holder && (holder.category !== source.item.category || (holder.resourceId && holder.resourceId !== source.resourceId))) {
      if (!source.longSlug || findEntry(before, source.longSlug)) {
        throw new Error(`${slug} is already installed from ${holder.resourceId ?? 'another catalog entry'}; uninstall it first`)
      }
      slug = source.longSlug
    }
    assertSafeSlug(slug)
    const item = slug === source.item.slug ? source.item : { ...source.item, slug }
    const installed = await this.adapter(item.category).install(slug, item, options)
    let entry!: InstalledItem
    await updateRegistry(this.paths.aasHome, registry => {
      const existing = findEntry(registry, slug)
      const now = new Date().toISOString()
      const resourceId = source.resourceId ?? existing?.resourceId
      entry = {
        slug,
        category: item.category,
        version: item.version,
        installedAt: existing?.installedAt ?? now,
        updatedAt: now,
        compatibleWith: item.compatibleWith,
        enabledFor: installed.enabledFor ?? existing?.enabledFor ?? {},
        ...(resourceId ? { resourceId } : {}),
        ...(existing?.deployments ? { deployments: existing.deployments } : {}),
      }
      return upsertEntry(registry, entry)
    })
    await installed.afterRegistered?.()
    return { slug, version: item.version, installedAt: entry.installedAt }
  }

  async installAndEnable(ref: string, options: InstallOptions = {}): Promise<InstallOutcome> {
    const result = await this.install(ref, options)
    const slug = result.slug
    const entry = await this._entry(slug)
    const outcome: InstallOutcome = { ...result, category: entry.category, enabled: [], notEnabled: [] }
    if (this.adapter(entry.category).enabledByInstall) {
      outcome.enabled = TARGETS.filter(t => entry.enabledFor[t])
      return outcome
    }
    const targets = options.target ? [options.target] : entry.compatibleWith
    for (const target of targets) {
      const blocker = await this._blocker(entry, target)
      if (blocker) {
        outcome.notEnabled.push({ target, ...blocker })
        continue
      }
      try {
        await this.enable(slug, target)
      } catch (e) {
        // Keep the error class and its fields: callers map them to what the user should do.
        if (e instanceof Error) {
          e.message = `Installed ${slug} ${result.version}, but enabling it for ${target} failed: ${e.message}`
          throw e
        }
        throw new Error(`Installed ${slug} ${result.version}, but enabling it for ${target} failed: ${String(e)}`)
      }
      outcome.enabled.push(target)
    }
    return outcome
  }

  async getTargetStatus(slug: string): Promise<TargetStatus[]> {
    const entry = await this._entry(slug)
    const status: TargetStatus[] = []
    for (const target of TARGETS) {
      const blocker = await this._blocker(entry, target)
      status.push({
        target,
        compatible: entry.compatibleWith.includes(target),
        enabled: entry.enabledFor[target] === true,
        ...(blocker ? { blocker } : {}),
      })
    }
    return status
  }

  /** What would make enabling `target` fail before anything is written; the relay is started on enable, so it is not a blocker. */
  private async _blocker(entry: InstalledItem, target: ToolTarget): Promise<{ reason: EnableBlocker; message: string } | undefined> {
    if (!entry.compatibleWith.includes(target)) {
      return { reason: 'incompatible', message: new IncompatibleTargetError(entry.slug, target, entry.compatibleWith).message }
    }
    return this.adapter(entry.category).blocker(entry, target)
  }

  async uninstall(slug: string, options: UninstallOptions = {}): Promise<void> {
    const entry = await this._entry(slug)
    await this.adapter(entry.category).uninstall(entry, options)
    await updateRegistry(this.paths.aasHome, r => removeEntry(r, slug))
  }

  private async _setDeployment(slug: string, target: ToolTarget, record: SkillDeployment | null): Promise<void> {
    await setDeploymentRecord(this.paths.aasHome, slug, target, record)
  }

  private async _setEnabled(slug: string, target: ToolTarget, enabled: boolean): Promise<void> {
    await setEnabledFlag(this.paths.aasHome, slug, target, enabled)
  }

  async enable(slug: string, target: ToolTarget, options: EnableOptions = {}): Promise<void> {
    const entry = await this._entry(slug)
    if (!entry.compatibleWith.includes(target)) throw new IncompatibleTargetError(slug, target, entry.compatibleWith)
    await this.adapter(entry.category).enable(entry, target, options)
    await this._setEnabled(slug, target, true)
  }

  async disable(slug: string, target: ToolTarget, options: DisableOptions = {}): Promise<void> {
    const entry = await this._entry(slug)
    await this.adapter(entry.category).disable(entry, target, options)
    await this._setEnabled(slug, target, false)
  }

  async getConfigSchema(slug: string): Promise<{ schema: JsonSchema; current: Record<string, unknown> }> {
    const entry = await this._entry(slug)
    const dir = itemDir(this.paths.aasHome, entry.category, slug)
    const manifest = await this.adapter(entry.category).readManifest(entry) as { configSchema?: JsonSchema }
    let current: Record<string, unknown> = {}
    try {
      current = JSON.parse(await readFile(join(dir, 'config.json'), 'utf-8')) as Record<string, unknown>
    } catch { /* skills have no config.json */ }
    return { schema: manifest.configSchema ?? {}, current }
  }

  async setConfig(slug: string, values: Record<string, unknown>): Promise<void> {
    const entry = await this._entry(slug)
    const adapter = this.adapter(entry.category)
    const dir = itemDir(this.paths.aasHome, entry.category, slug)
    const configPath = join(dir, 'config.json')
    let previous: string | undefined
    try { previous = await readFile(configPath, 'utf-8') } catch { /* not configured yet */ }
    const restoreConfig = async () => {
      if (previous === undefined) await rm(configPath, { force: true })
      else await atomicWriteSecretFile(configPath, previous)
    }
    const targets = TARGETS.filter(t => entry.enabledFor[t])
    await atomicWriteSecretFile(configPath, JSON.stringify(values, null, 2))
    const synced: ToolTarget[] = []
    try {
      // Check every target before writing any, so one refusing leaves all of them as they were.
      for (const target of targets) await adapter.resync(entry, target, { dryRun: true })
      for (const target of targets) {
        await adapter.resync(entry, target)
        synced.push(target)
      }
    } catch (e) {
      // A refused resync must not leave values behind that a later `as sync` would push,
      // nor tools that already took the new values.
      await restoreConfig()
      const stuck: string[] = []
      for (const target of synced) {
        try {
          await adapter.resync(entry, target)
        } catch (restoreError) {
          stuck.push(`${target} (${(restoreError as Error).message})`)
        }
      }
      if (stuck.length) {
        throw new Error(`${(e as Error).message}; the previous config was put back in ${configPath}, but these tools still have the new values: ${stuck.join('; ')}. Run \`aas sync\` to retry`)
      }
      throw e
    }
  }

  async sync(targets?: ToolTarget[]): Promise<SyncResult> {
    const registry = await readRegistry(this.paths.aasHome)
    const effectiveTargets: ToolTarget[] = targets ?? ['claude', 'codex']
    const synced: string[] = []
    const errors: Array<{ slug: string; error: string }> = []
    for (const entry of registry.installed) {
      for (const target of effectiveTargets) {
        if (!entry.enabledFor[target]) continue
        try {
          await this.adapter(entry.category).resync(entry, target)
          synced.push(`${entry.slug}:${target}`)
        } catch (e) {
          errors.push({ slug: `${entry.slug}:${target}`, error: String(e) })
        }
      }
    }
    return { synced, errors }
  }

  async checkUpdates(slugs?: string[]): Promise<UpdateAvailable[]> {
    const registry = await readRegistry(this.paths.aasHome)
    return _checkUpdates(registry, this.catalog, slugs)
  }

  async update(slug?: string): Promise<UpdateResult[]> {
    const registry = await readRegistry(this.paths.aasHome)
    const entries = slug
      ? registry.installed.filter(e => e.slug === slug)
      : registry.installed
    const results: UpdateResult[] = []
    const failures: Array<{ slug: string; error: string }> = []
    for (const entry of entries) {
      try {
        if (entry.parentSlug) continue
        const fromVersion = entry.version
        const latest = await latestFor(this.catalog, entry)
        const latestItem = { ...latest.item, slug: entry.slug }
        if (latestItem.version === fromVersion) continue
        await this.adapter(entry.category).update(entry, latestItem)
        await this._setVersion(entry.slug, latestItem.version, latest.resourceId)
        results.push({ slug: entry.slug, fromVersion, toVersion: latestItem.version })
      } catch (e) {
        failures.push({ slug: entry.slug, error: e instanceof Error ? e.message : String(e) })
      }
    }
    if (failures.length) throw new UpdateFailedError(results, failures)
    return results
  }

  private async _setVersion(slug: string, version: string, resourceId: string | null): Promise<void> {
    await patchEntry(this.paths.aasHome, slug, e => ({
      ...e, version, ...(resourceId ? { resourceId } : {}), updatedAt: new Date().toISOString(),
    }))
  }

  async list(options?: ListOptions): Promise<InstalledItem[]> {
    const registry = await readRegistry(this.paths.aasHome)
    let items = registry.installed
    if (options?.category) items = items.filter(e => e.category === options.category)
    if (options?.enabledFor) items = items.filter(e => e.enabledFor[options.enabledFor!] === true)
    return items
  }

  async info(slug: string): Promise<ItemDetail> {
    const registry = await readRegistry(this.paths.aasHome)
    const entries = registry.installed
    const entry = entries.find(item => item.slug === slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    const dir = itemDir(this.paths.aasHome, entry.category, slug)
    const manifest = await this.adapter(entry.category).readManifest(entry) as unknown as {
      name: string; description: string
      publisher: import('@as/types').Publisher; tags: string[]; downloads: number
      configSchema?: import('@as/types').JsonSchema; supportedModels?: string[]
      transport?: 'stdio' | 'sse' | 'http'; serverCommand?: string
      url?: string; headers?: Record<string, string>; contentUrl?: string
    }
    let currentConfig: Record<string, unknown> | undefined
    try {
      currentConfig = JSON.parse(await readFile(join(dir, 'config.json'), 'utf-8')) as Record<string, unknown>
    } catch { /* skills have no config.json */ }
    return {
      ...entry,
      name: manifest.name,
      description: manifest.description,
      publisher: manifest.publisher,
      tags: manifest.tags,
      downloads: manifest.downloads,
      configSchema: manifest.configSchema,
      currentConfig,
      supportedModels: manifest.supportedModels,
      transport: manifest.transport,
      serverCommand: manifest.serverCommand,
      url: manifest.url,
      headers: manifest.headers,
      contentUrl: manifest.contentUrl,
    }
  }

  async duplicateProvider(slug: string): Promise<{ newSlug: string }> {
    let newSlug = ''
    // Picking the free slug and copying run under the lock so two duplicates can't pick the same one.
    await updateRegistry(this.paths.aasHome, async registry => {
      const entry = findEntry(registry, slug)
      if (!entry) throw new Error(`Item not installed: ${slug}`)
      if (entry.category !== 'provider') throw new Error(`Only providers can be duplicated: ${slug}`)

      const rootSlug = entry.parentSlug ?? slug

      newSlug = `${slug}-copy`
      let suffix = 2
      while (findEntry(registry, newSlug)) {
        newSlug = `${slug}-copy-${suffix}`
        suffix += 1
      }

      const sourceDir = itemDir(this.paths.aasHome, 'provider', slug)
      const targetDir = itemDir(this.paths.aasHome, 'provider', newSlug)
      await duplicateProviderConnection(sourceDir, targetDir, newSlug)

      const now = new Date().toISOString()
      return upsertEntry(registry, {
        slug: newSlug,
        category: 'provider',
        version: entry.version,
        installedAt: now,
        updatedAt: now,
        compatibleWith: entry.compatibleWith,
        enabledFor: {},
        parentSlug: rootSlug,
      })
    })
    return { newSlug }
  }

  async getUsageSummary(options?: UsageSummaryOptions): Promise<UsageSummaryRow[]> {
    return getDailySummary(this.paths.aasHome, options)
  }

  async getRecentRequests(options?: { limit?: number }): Promise<RecentRequestRow[]> {
    return getRecentRequests(this.paths.aasHome, options)
  }

  async getRelayStatus(): Promise<RelayStatus> {
    const status = await getRelayDaemonStatus(this.paths.aasHome)
    const routedAgents: Partial<Record<ToolTarget, boolean>> = {}
    const checks: Array<[ToolTarget, () => Promise<boolean>]> = [
      ['claude', () => claudeUsesRelay(this.paths.claudeConfigDir)],
      ['codex', () => codexUsesRelay(this.paths.codexConfigDir)],
    ]
    for (const [target, check] of checks) {
      try {
        routedAgents[target] = await check()
      } catch {
        // a config that does not parse says nothing either way
      }
    }
    return { ...status, routedAgents }
  }

  async startRelay(): Promise<RelayStatus> {
    if (!this.options.startRelay) throw new Error('this client cannot start the relay; run: aas relay start')
    await this.options.startRelay()
    await waitForRelayStatus(this.paths.aasHome, (s) => !s.running || s.listeners !== undefined)
    return this.getRelayStatus()
  }

  async stopRelay(): Promise<RelayStatus> {
    if (!this.options.stopRelay) throw new Error('this client cannot stop the relay; run: aas relay stop')
    await this.options.stopRelay()
    return this.getRelayStatus()
  }

  async testProvider(slug: string): Promise<ProviderTestResult[]> {
    const entry = await this._entry(slug)
    if (entry.category !== 'provider') throw new Error(`Only providers can be tested: ${slug}`)
    const connection = await readProviderConnection(itemDir(this.paths.aasHome, 'provider', slug))
    const results: ProviderTestResult[] = []
    const byUrl = new Map<string, ProviderTestResult>()
    for (const target of TARGETS.filter((t) => entry.compatibleWith.includes(t))) {
      const result = await testProviderConnection(connection, target, { fetchImpl: this.options.fetchImpl })
      const same = byUrl.get(result.url)
      results.push(same ? { ...same, target } : result)
      byUrl.set(result.url, result)
    }
    return results
  }

  async setProviderOrder(slugs: string[]): Promise<Array<{ slug: string; level: number }>> {
    if (new Set(slugs).size !== slugs.length) throw new Error('setProviderOrder: a provider is listed twice')
    const registry = await readRegistry(this.paths.aasHome)
    for (const slug of slugs) {
      const entry = findEntry(registry, slug)
      if (!entry) throw new Error(`Item not installed: ${slug}`)
      if (entry.category !== 'provider') throw new Error(`Only providers have a priority: ${slug}`)
    }
    const written: Array<{ path: string; previous: string | undefined }> = []
    try {
      for (const [i, slug] of slugs.entries()) {
        const path = join(itemDir(this.paths.aasHome, 'provider', slug), 'config.json')
        let previous: string | undefined
        try { previous = await readFile(path, 'utf-8') } catch { /* not configured yet */ }
        const parsed = previous === undefined ? {} : JSON.parse(previous) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${path} is not a JSON object`)
        const level = i + 1
        if ((parsed as Record<string, unknown>)['level'] === level) continue
        await atomicWriteSecretFile(path, JSON.stringify({ ...parsed, level }, null, 2))
        written.push({ path, previous })
      }
    } catch (e) {
      for (const { path, previous } of written.reverse()) {
        if (previous === undefined) await rm(path, { force: true })
        else await atomicWriteSecretFile(path, previous)
      }
      throw e
    }
    return slugs.map((slug, i) => ({ slug, level: i + 1 }))
  }

  async getProviderHealth(): Promise<ProviderHealth[]> {
    return readProviderHealth(this.paths.aasHome)
  }

  async resetProviderHealth(providerSlug: string): Promise<void> {
    resetProviderHealth(this.paths.aasHome, providerSlug)
  }

  async listLocalConfigs(): Promise<LocalRelayConfig[]> {
    return _listLocalConfigs(this.paths.aasHome)
  }

  async addLocalConfig(name: string): Promise<LocalRelayConfig> {
    return _addLocalConfig(this.paths.aasHome, name)
  }

  async removeLocalConfig(id: string): Promise<void> {
    return _removeLocalConfig(this.paths.aasHome, id)
  }

  async updateLocalConfig(
    id: string,
    patch: { name?: string; port?: number; enabledFor?: Partial<Record<ToolTarget, boolean>> }
  ): Promise<LocalRelayConfig> {
    return _updateLocalConfig(this.paths.aasHome, id, patch)
  }

  async toggleLocalConfig(id: string): Promise<LocalRelayConfig> {
    return _toggleLocalConfig(this.paths.aasHome, id)
  }

  async getEntitlements(): Promise<Entitlements> {
    return resolveEntitlements(this.paths.aasHome)
  }

  async syncEntitlement(token: string): Promise<Entitlements> {
    const result = await this.client.getMyEntitlements(token)
    if (result.error || !result.data) throw new Error(result.error ?? 'Failed to fetch entitlements')
    await writeEntitlementCache(this.paths.aasHome, result.data.plan)
    return entitlementsForPlan(result.data.plan)
  }

  async createCheckout(period: 'monthly' | 'yearly' | 'lifetime', token?: string): Promise<{ checkoutUrl: string }> {
    const result = await this.client.createCheckout({ period }, { token })
    if (result.error || !result.data) throw new Error(result.error ?? 'Failed to create checkout session')
    return result.data
  }

  async clearEntitlement(): Promise<Entitlements> {
    await writeEntitlementCache(this.paths.aasHome, 'free')
    return entitlementsForPlan('free')
  }

  async exportUsage(format: 'csv' | 'json', days?: number): Promise<string> {
    return exportUsageToFile(this.paths.aasHome, format, { days })
  }

  async getBudget(): Promise<BudgetConfig> {
    return readBudget(this.paths.aasHome)
  }

  async setBudget(config: BudgetConfig): Promise<BudgetConfig> {
    return writeBudget(this.paths.aasHome, config)
  }

  async getBudgetStatus(): Promise<BudgetStatus> {
    return getBudgetStatus(this.paths.aasHome)
  }

  listProjects(): Promise<Project[]> {
    return this.projects.list()
  }

  addProject(path: string, options?: AddProjectOptions): Promise<Project> {
    return this.projects.add(path, options)
  }

  removeProject(ref: string): Promise<void> {
    return this.projects.remove(ref)
  }

  relocateProject(ref: string, newPath: string): Promise<Project> {
    return this.projects.relocate(ref, newPath)
  }

  getProject(ref: string): Promise<ProjectDetail> {
    return this.projects.detail(ref)
  }

  installToProject(ref: string, itemRef: string, options?: ProjectInstallOptions): Promise<ProjectInstallResult> {
    return this.projects.install(ref, itemRef, options)
  }

  uninstallFromProject(ref: string, slug: string, options?: ProjectUninstallOptions): Promise<ProjectUninstallResult> {
    return this.projects.uninstall(ref, slug, options)
  }

  setProjectEnv(ref: string, name: string, value: string): Promise<void> {
    return this.projects.setEnv(ref, name, value)
  }

  unsetProjectEnv(ref: string, name: string): Promise<void> {
    return this.projects.unsetEnv(ref, name)
  }

  getProjectEnvValues(ref: string): Promise<Record<string, string>> {
    return this.projects.envValues(ref)
  }

  getBackupStatus(options?: { fetch?: boolean }): Promise<BackupStatus> {
    return this.backup.status(options)
  }

  connectBackup(options: BackupConnectOptions): Promise<BackupConnectResult> {
    return this.backup.connect(options)
  }

  backupNow(): Promise<BackupSyncResult> {
    return this.backup.backupNow()
  }

  pullBackup(): Promise<BackupSyncResult> {
    return this.backup.pull()
  }

  resolveBackupConflict(item: string, choice: BackupConflictChoice): Promise<BackupResolveResult> {
    return this.backup.resolve(item, choice)
  }

  listBackupSnapshots(): Promise<BackupSnapshot[]> {
    return this.backup.snapshots()
  }

  restoreBackupSnapshot(id: string): Promise<BackupRestoreResult> {
    return this.backup.restore(id)
  }

  listBackupHistory(options?: { limit?: number }): Promise<BackupHistoryEntry[]> {
    return this.backup.history(options)
  }

  disconnectBackup(): Promise<void> {
    return this.backup.disconnect()
  }
}
