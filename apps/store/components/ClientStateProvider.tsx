'use client'

import type { Item } from '@as/types'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'aas-store-client-state'

interface StoredState {
  favorites: Record<string, boolean>
  installed: Record<string, boolean>
  userItems: Item[]
}

const EMPTY_STATE: StoredState = { favorites: {}, installed: {}, userItems: [] }

function readStorage(): StoredState {
  if (typeof window === 'undefined') return EMPTY_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    return { ...EMPTY_STATE, ...(JSON.parse(raw) as Partial<StoredState>) }
  } catch {
    return EMPTY_STATE
  }
}

function writeStorage(state: StoredState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

interface ClientStateValue extends StoredState {
  toggleFavorite: (id: string) => void
  toggleInstalled: (id: string) => void
  addUserItem: (item: Item) => void
}

const ClientStateContext = createContext<ClientStateValue | null>(null)

export function ClientStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredState>(EMPTY_STATE)

  useEffect(() => {
    setState(readStorage())
  }, [])

  function update(updater: (prev: StoredState) => StoredState) {
    setState((prev) => {
      const next = updater(prev)
      writeStorage(next)
      return next
    })
  }

  const value: ClientStateValue = {
    ...state,
    toggleFavorite: (id) =>
      update((prev) => ({ ...prev, favorites: { ...prev.favorites, [id]: !prev.favorites[id] } })),
    toggleInstalled: (id) =>
      update((prev) => ({ ...prev, installed: { ...prev.installed, [id]: !prev.installed[id] } })),
    addUserItem: (item) => update((prev) => ({ ...prev, userItems: [item, ...prev.userItems] })),
  }

  return <ClientStateContext.Provider value={value}>{children}</ClientStateContext.Provider>
}

export function useClientState(): ClientStateValue {
  const ctx = useContext(ClientStateContext)
  if (!ctx) throw new Error('useClientState must be used within ClientStateProvider')
  return ctx
}
