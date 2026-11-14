import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { FavoriteEntry, ResourceSummary } from '@as/types'
import { callRpc, RpcError } from '../lib/rpc'
import { readLocalState, writeLocalState } from './LocalPersistence'
import { useAuth } from './Auth'

/**
 * Favorites (#195). Signed in they are the account's (/api/me/favorites, shared with the
 * website); signed out they stay in favorites.json in the app data folder. Every change to
 * the account goes through `pending` first, which is saved before it is sent, so nothing
 * done offline is lost.
 */

export interface FavoriteItem {
  id: string
  /** null when the catalog no longer has the entry. */
  resource: ResourceSummary | null
}

interface PendingChange {
  id: string
  on: boolean
  resource: ResourceSummary | null
}

export interface StoredFavorites {
  version: 1
  /** Favorited while signed out, newest first. */
  local: FavoriteItem[]
  /** Account changes not yet accepted by the API, oldest first. */
  pending: PendingChange[]
  /** The last account list, for showing it offline. Dropped on sign-out. */
  account: { userId: string | null; items: FavoriteItem[] } | null
}

export const EMPTY: StoredFavorites = { version: 1, local: [], pending: [], account: null }
const KEY = 'favorites'
const RETRY_MS = 60_000

/** The fields of a catalog row worth keeping next to a favorite (a detail carries much more). */
export function summaryOf(r: ResourceSummary): ResourceSummary {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    description: r.description,
    author: r.author,
    version: r.version,
    homepageUrl: r.homepageUrl,
    installs: r.installs,
    stars: r.stars,
    verified: r.verified,
    tags: r.tags,
    transports: r.transports,
    origin: r.origin,
  }
}

/** The account list as the user sees it: what the API returned, with the queued changes applied. */
export function applyPending(items: FavoriteItem[], pending: PendingChange[]): FavoriteItem[] {
  let out = items
  for (const change of pending) {
    out = out.filter((f) => f.id !== change.id)
    if (change.on) out = [{ id: change.id, resource: change.resource }, ...out]
  }
  return out
}

/** On sign-in, local favorites become additions to the account. */
export function mergeLocalIntoPending(state: StoredFavorites): StoredFavorites {
  if (state.local.length === 0) return state
  const adds = [...state.local].reverse().map((f) => ({ id: f.id, on: true, resource: f.resource }))
  const queued = new Set(state.pending.map((p) => p.id))
  return { ...state, local: [], pending: [...adds.filter((a) => !queued.has(a.id)), ...state.pending] }
}

/** On sign-out, additions not yet sent stay on this machine; removals of account entries are dropped. */
export function keepUnsentLocally(state: StoredFavorites): StoredFavorites {
  const kept = state.pending.filter((p) => p.on).map((p) => ({ id: p.id, resource: p.resource }))
  const local = [...kept.reverse(), ...state.local.filter((f) => !kept.some((k) => k.id === f.id))]
  return { version: 1, local, pending: [], account: null }
}

function fromEntries(entries: FavoriteEntry[]): FavoriteItem[] {
  return entries.map((e) => ({ id: e.id, resource: e.resource }))
}

interface FavoritesValue {
  items: FavoriteItem[]
  ids: Set<string>
  isFavorite: (id: string) => boolean
  /** Returns the new state: true when it is now a favorite. */
  toggle: (id: string, resource: ResourceSummary | null) => boolean
  /** Signed in: true while the account list is being read for the first time. */
  loading: boolean
  /** Changes waiting for the account. */
  unsynced: number
  /** The last account request failed for a reason that may pass (offline, server error). */
  syncError: boolean
  /** Ids the account refused because it holds 500 already; each one is reported once. */
  refusedFull: string | null
  clearRefused: () => void
  retry: () => void
}

const FavoritesContext = createContext<FavoritesValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { signedIn, userId, restoring, getAccessToken } = useAuth()
  const [state, setState] = useState<StoredFavorites>(EMPTY)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [syncError, setSyncError] = useState(false)
  const [refusedFull, setRefusedFull] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const stateRef = useRef(state)
  const busy = useRef(false)
  const wasSignedIn = useRef<boolean | null>(null)

  const update = useCallback((fn: (prev: StoredFavorites) => StoredFavorites) => {
    const next = fn(stateRef.current)
    stateRef.current = next
    setState(next)
    writeLocalState(KEY, next).catch(() => undefined)
  }, [])

  useEffect(() => {
    let active = true
    readLocalState<StoredFavorites>(KEY, EMPTY)
      .then(
        (stored) => {
          if (!active || stored?.version !== 1) return
          stateRef.current = { ...EMPTY, ...stored }
          setState(stateRef.current)
        },
        () => undefined
      )
      .finally(() => active && setReady(true))
    return () => {
      active = false
    }
  }, [])

  // Sign-in merges the local list; sign-out keeps what was never sent.
  useEffect(() => {
    if (!ready || restoring) return
    const before = wasSignedIn.current
    wasSignedIn.current = signedIn
    if (signedIn && before !== true) update(mergeLocalIntoPending)
    else if (!signedIn && before === true) update(keepUnsentLocally)
  }, [ready, restoring, signedIn, update])

  // A different account than the cached one: its list is not this account's.
  useEffect(() => {
    if (signedIn && userId && stateRef.current.account && stateRef.current.account.userId && stateRef.current.account.userId !== userId) {
      update((s) => ({ ...s, account: null }))
    }
  }, [signedIn, userId, update])

  const sync = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    let failed = false
    const fail = () => {
      failed = true
      setSyncError(true)
    }
    try {
      let token = await getAccessToken()
      if (!token) {
        fail()
        return
      }
      let retried = false
      for (let change = stateRef.current.pending[0]; change; change = stateRef.current.pending[0]) {
        try {
          await callRpc('setFavorite', [token, change.id, change.on])
        } catch (err) {
          const code = err instanceof RpcError ? err.code : undefined
          if (code === 'SessionExpiredError' && !retried) {
            retried = true
            token = await getAccessToken(true)
            if (!token) {
              fail()
              return
            }
            continue
          }
          if (code !== 'FavoriteRejectedError') {
            fail()
            return
          }
          if (err instanceof RpcError && err.fields.reason === 'full') setRefusedFull(change.id)
        }
        // By identity: a toggle while this was in flight replaced it, and the new change stays queued.
        update((s) => ({ ...s, pending: s.pending.filter((p) => p !== change) }))
      }
      const entries = await callRpc<FavoriteEntry[]>('listFavorites', [token])
      update((s) => ({ ...s, account: { userId, items: fromEntries(entries) } }))
      setSyncError(false)
    } catch {
      fail()
    } finally {
      busy.current = false
      setLoading(false)
    }
    // A toggle made while this pass was reading the list was not sent yet.
    if (stateRef.current.pending.length > 0 && !failed) setNonce((n) => n + 1)
  }, [getAccessToken, update, userId])

  useEffect(() => {
    if (!ready || restoring || !signedIn) return
    if (!stateRef.current.account) setLoading(true)
    void sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, restoring, signedIn, userId, nonce])

  useEffect(() => {
    if (!signedIn || (!syncError && state.pending.length === 0)) return
    const timer = setTimeout(() => setNonce((n) => n + 1), RETRY_MS)
    return () => clearTimeout(timer)
  }, [signedIn, syncError, state.pending.length, nonce])

  const items = useMemo(
    () => (signedIn ? applyPending(state.account?.items ?? [], state.pending) : state.local),
    [signedIn, state]
  )
  const ids = useMemo(() => new Set(items.map((f) => f.id)), [items])

  function toggle(id: string, resource: ResourceSummary | null): boolean {
    const on = !ids.has(id)
    const snapshot = resource ? summaryOf(resource) : null
    if (signedIn) {
      update((s) => ({ ...s, pending: [...s.pending.filter((p) => p.id !== id), { id, on, resource: snapshot }] }))
      setNonce((n) => n + 1)
    } else {
      update((s) => ({
        ...s,
        local: on ? [{ id, resource: snapshot }, ...s.local.filter((f) => f.id !== id)] : s.local.filter((f) => f.id !== id),
      }))
    }
    return on
  }

  return (
    <FavoritesContext.Provider
      value={{
        items,
        ids,
        isFavorite: (id) => ids.has(id),
        toggle,
        loading: signedIn && loading,
        unsynced: signedIn ? state.pending.length : 0,
        syncError: signedIn && syncError,
        refusedFull,
        clearRefused: () => setRefusedFull(null),
        retry: () => setNonce((n) => n + 1),
      }}
    >
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites(): FavoritesValue {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider')
  return ctx
}
