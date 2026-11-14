import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type AgentApp = 'claude' | 'codex'
export type NavView = 'browse' | 'overview' | 'settings'
export type CategoryFilter = 'all' | 'provider' | 'skill' | 'mcp'
export type SettingsTab = 'account' | 'general' | 'about'
export type ShellDialog = 'shortcuts' | 'activity' | 'requestLog' | null
export type DiscoverKind = 'all' | 'skill' | 'mcp' | 'provider'

interface AppStateValue {
  agentApp: AgentApp
  setAgentApp: (a: AgentApp) => void
  navView: NavView
  setNavView: (v: NavView) => void
  categoryFilter: CategoryFilter
  setCategoryFilter: (c: CategoryFilter) => void
  selectedSlug: string | null
  setSelectedSlug: (slug: string | null) => void
  editingConfigSlug: string | null
  setEditingConfigSlug: (slug: string | null) => void
  favoriteSlugs: Set<string>
  toggleFavorite: (slug: string) => void
  terminalExpanded: boolean
  setTerminalExpanded: (v: boolean) => void
  installedVersion: number
  bumpInstalledVersion: () => void
  settingsTab: SettingsTab
  setSettingsTab: (tab: SettingsTab) => void
  /** null until the first catalog search answers. */
  catalogOffline: boolean | null
  setCatalogOffline: (v: boolean) => void
  /** A search handed to the resource list from outside it (the command palette); the list consumes it. */
  searchSeed: string | null
  setSearchSeed: (q: string | null) => void
  paletteOpen: boolean
  setPaletteOpen: (v: boolean | ((prev: boolean) => boolean)) => void
  shellDialog: ShellDialog
  setShellDialog: (d: ShellDialog) => void
  /** Kind filter of the Discover page; other pages preset it when they send the user there. */
  discoverKind: DiscoverKind
  setDiscoverKind: (k: DiscoverKind) => void
  /** A catalog id the install dialog should open for; the dialog consumes it. */
  installRef: string | null
  requestInstall: (ref: string | null) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [agentApp, setAgentApp] = useState<AgentApp>('claude')
  const [navView, setNavView] = useState<NavView>('browse')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [editingConfigSlug, setEditingConfigSlug] = useState<string | null>(null)
  const [favoriteSlugs, setFavoriteSlugs] = useState<Set<string>>(new Set())
  const [terminalExpanded, setTerminalExpanded] = useState(false)
  const [installedVersion, setInstalledVersion] = useState(0)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')
  const [catalogOffline, setCatalogOffline] = useState<boolean | null>(null)
  const [searchSeed, setSearchSeed] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shellDialog, setShellDialog] = useState<ShellDialog>(null)
  const [discoverKind, setDiscoverKind] = useState<DiscoverKind>('all')
  const [installRef, requestInstall] = useState<string | null>(null)

  const bumpInstalledVersion = useCallback(() => {
    setInstalledVersion((prev) => prev + 1)
  }, [])

  function toggleFavorite(slug: string) {
    setFavoriteSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  return (
    <AppStateContext.Provider
      value={{
        agentApp, setAgentApp,
        navView, setNavView, categoryFilter, setCategoryFilter,
        selectedSlug, setSelectedSlug,
        editingConfigSlug, setEditingConfigSlug,
        favoriteSlugs, toggleFavorite, terminalExpanded, setTerminalExpanded,
        installedVersion, bumpInstalledVersion,
        settingsTab, setSettingsTab,
        catalogOffline, setCatalogOffline,
        searchSeed, setSearchSeed,
        paletteOpen, setPaletteOpen,
        shellDialog, setShellDialog,
        discoverKind, setDiscoverKind,
        installRef, requestInstall,
      }}
    >
      {children}
    </AppStateContext.Provider>
  )
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
