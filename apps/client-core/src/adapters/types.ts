import type {
  DisableOptions, EnableBlocker, EnableOptions, InstalledItem, InstallOptions, Item, Paths, ToolTarget,
} from '@as/types'

export type EnabledFor = Partial<Record<ToolTarget, boolean>>

export interface AdapterContext {
  paths: Required<Paths>
  /** Starts the local relay daemon (providers). */
  startRelay?: () => Promise<void>
  /**
   * Records one tool's flag in the registry. Adapters call it right after each tool
   * config change, so a run that stops halfway leaves the registry truthful.
   */
  setEnabled(slug: string, target: ToolTarget, enabled: boolean): Promise<void>
}

export interface Installed {
  /** Tools that installing alone turned on (skills); omitted to keep the existing flags. */
  enabledFor?: EnabledFor
  /** Runs once the registry entry exists (the skill's Claude link). */
  afterRegistered?: () => Promise<void>
}

/**
 * Everything one kind of item needs to live in ~/.agents and in each tool's config.
 * The engine owns the registry entry, compatibility, the install/enable policy and
 * config.json; an adapter owns the item's files and every tool config write.
 */
export interface KindAdapter {
  /** Install turns the item on by itself, so installAndEnable has nothing left to enable. */
  readonly enabledByInstall: boolean
  /** Puts the item's files in place; nothing is left behind when it throws. */
  install(slug: string, item: Item, options: InstallOptions): Promise<Installed>
  /** New files, then every enabled tool; on failure the old files and tool entries are back. */
  update(entry: InstalledItem, item: Item): Promise<void>
  /** Takes the item off every tool it is actually on, then removes its files. */
  uninstall(entry: InstalledItem, options: DisableOptions): Promise<void>
  /** Checks the item is ready for `target`, then writes the tool's entry. */
  enable(entry: InstalledItem, target: ToolTarget, options: EnableOptions): Promise<void>
  /**
   * Rewrites an already enabled tool's entry from the current files and config.
   * `dryRun` runs the checks that could refuse the write and writes nothing.
   */
  resync(entry: InstalledItem, target: ToolTarget, options?: { dryRun?: boolean }): Promise<void>
  /** Removes the tool's entry; only what the item wrote, and only when nothing else needs it. */
  disable(entry: InstalledItem, target: ToolTarget, options: DisableOptions): Promise<void>
  /** What would make enable refuse now, other than compatibility. */
  blocker(entry: InstalledItem, target: ToolTarget): Promise<{ reason: EnableBlocker; message: string } | undefined>
  /** The catalog item as installed. */
  readManifest(entry: InstalledItem): Promise<Item>
}
