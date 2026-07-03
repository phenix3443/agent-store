import { createContext, useContext, useState, type ReactNode } from 'react'

export type AgentApp = 'claude' | 'codex'
export type NavView = 'browse' | 'updates'
export type CategoryFilter = 'all' | 'provider' | 'skill' | 'mcp'
export type ListFilter = 'all' | 'popular' | 'recent' | 'installed' | 'enabled' | 'disabled' | 'favorites'

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
  favoriteSlugs: Set<string>
  toggleFavorite: (slug: string) => void
  terminalExpanded: boolean
  setTerminalExpanded: (v: boolean) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [agentApp, setAgentApp] = useState<AgentApp>('claude')
  const [navView, setNavView] = useState<NavView>('browse')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [favoriteSlugs, setFavoriteSlugs] = useState<Set<string>>(new Set())
  const [terminalExpanded, setTerminalExpanded] = useState(false)

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
        favoriteSlugs, toggleFavorite, terminalExpanded, setTerminalExpanded,
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
