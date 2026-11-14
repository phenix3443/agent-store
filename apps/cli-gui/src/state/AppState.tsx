import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type AgentApp = 'claude' | 'codex'
export type NavView = 'browse' | 'overview' | 'settings'
export type CategoryFilter = 'all' | 'provider' | 'skill' | 'mcp'
export type ListFilter =
  | 'all' | 'featured' | 'popular' | 'recent' | 'recommended' | 'installed' | 'enabled' | 'disabled' | 'updates'
export type SettingsTab = 'general' | 'agents' | 'data' | 'account' | 'cli' | 'about'
export type ShellDialog = 'shortcuts' | 'activity' | 'requestLog' | 'welcome' | null

interface AppStateValue {
  agentApp: AgentApp
  setAgentApp: (a: AgentApp) => void
  navView: NavView
  setNavView: (v: NavView) => void
  categoryFilter: CategoryFilter
  setCategoryFilter: (c: CategoryFilter) => void
  listFilter: ListFilter
  setListFilter: (f: ListFilter) => void
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
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [agentApp, setAgentApp] = useState<AgentApp>('claude')
  const [navView, setNavView] = useState<NavView>('browse')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [listFilter, setListFilter] = useState<ListFilter>('all')
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
        listFilter, setListFilter, selectedSlug, setSelectedSlug,
        editingConfigSlug, setEditingConfigSlug,
        favoriteSlugs, toggleFavorite, terminalExpanded, setTerminalExpanded,
        installedVersion, bumpInstalledVersion,
        settingsTab, setSettingsTab,
        catalogOffline, setCatalogOffline,
        searchSeed, setSearchSeed,
        paletteOpen, setPaletteOpen,
        shellDialog, setShellDialog,
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
