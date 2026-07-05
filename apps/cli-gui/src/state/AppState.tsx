import { createContext, useContext, useState, type ReactNode } from 'react'

export type AgentApp = 'claude' | 'codex'
export type Theme = 'dark' | 'light'
export type NavView = 'browse' | 'overview'
export type CategoryFilter = 'all' | 'provider' | 'skill' | 'mcp'
export type ListFilter =
  | 'all' | 'featured' | 'popular' | 'recent' | 'recommended' | 'installed' | 'enabled' | 'disabled' | 'updates'

interface AppStateValue {
  theme: Theme
  toggleTheme: () => void
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
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [agentApp, setAgentApp] = useState<AgentApp>('claude')
  const [navView, setNavView] = useState<NavView>('overview')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [editingConfigSlug, setEditingConfigSlug] = useState<string | null>(null)
  const [favoriteSlugs, setFavoriteSlugs] = useState<Set<string>>(new Set())
  const [terminalExpanded, setTerminalExpanded] = useState(false)
  const [installedVersion, setInstalledVersion] = useState(0)

  function bumpInstalledVersion() {
    setInstalledVersion((prev) => prev + 1)
  }

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

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
        theme, toggleTheme,
        agentApp, setAgentApp,
        navView, setNavView, categoryFilter, setCategoryFilter,
        listFilter, setListFilter, selectedSlug, setSelectedSlug,
        editingConfigSlug, setEditingConfigSlug,
        favoriteSlugs, toggleFavorite, terminalExpanded, setTerminalExpanded,
        installedVersion, bumpInstalledVersion,
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
