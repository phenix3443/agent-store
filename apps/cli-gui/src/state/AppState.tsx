import { createContext, useContext, useState, type ReactNode } from 'react'

export type Section = 'installed' | 'browse' | 'updates' | 'favorites'
export type AgentApp = 'claude' | 'codex'

interface AppStateValue {
  section: Section
  setSection: (s: Section) => void
  agentApp: AgentApp
  setAgentApp: (a: AgentApp) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [section, setSection] = useState<Section>('installed')
  const [agentApp, setAgentApp] = useState<AgentApp>('claude')

  return (
    <AppStateContext.Provider value={{ section, setSection, agentApp, setAgentApp }}>
      {children}
    </AppStateContext.Provider>
  )
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
