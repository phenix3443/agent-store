'use client'

import * as Toast from '@radix-ui/react-toast'
import { Heart } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { requestLogin } from '@/lib/login-request'

export type SaveOutcome = 'ok' | 'signedOut' | 'full' | 'error'

/** Server actions, passed in by the root layout (app/favorites/actions.ts). */
export interface FavoriteActions {
  list: () => Promise<string[] | null>
  save: (id: string, on: boolean) => Promise<SaveOutcome>
}

// The heart pressed while signed out, saved once the visitor is back from signing in.
const PENDING_KEY = 'as.pendingFavorite'

type Message = 'saved' | 'removed' | 'failed' | 'full'

interface FavoritesValue {
  signedIn: boolean
  /** Null while the list is loading, or when it could not be read. */
  ids: ReadonlySet<string> | null
  loading: boolean
  /** `on` forces the direction; without it the current state is flipped. */
  toggle: (id: string, on?: boolean) => Promise<SaveOutcome | 'login'>
}

const FavoritesContext = createContext<FavoritesValue>({
  signedIn: false,
  ids: null,
  loading: false,
  toggle: async () => 'error',
})

export function useFavorites(): FavoritesValue {
  return useContext(FavoritesContext)
}

function readPending(): string | null {
  try {
    const id = sessionStorage.getItem(PENDING_KEY)
    sessionStorage.removeItem(PENDING_KEY)
    return id
  } catch {
    return null
  }
}

export function FavoritesProvider({
  signedIn,
  actions,
  children,
}: {
  signedIn: boolean
  actions: FavoriteActions
  children: React.ReactNode
}) {
  const t = useTranslations('store.favorite')
  const [ids, setIds] = useState<ReadonlySet<string> | null>(null)
  const [loading, setLoading] = useState(signedIn)
  const [message, setMessage] = useState<{ kind: Message; key: number } | null>(null)
  const idsRef = useRef(ids)
  idsRef.current = ids

  const say = useCallback((kind: Message) => setMessage({ kind, key: Date.now() }), [])

  useEffect(() => {
    if (!signedIn) return
    let live = true
    void (async () => {
      const list = await actions.list()
      if (!live) return
      const next = new Set(list ?? [])
      const pending = readPending()
      if (list && pending && !next.has(pending)) {
        const outcome = await actions.save(pending, true)
        if (!live) return
        if (outcome === 'ok') next.add(pending)
        say(outcome === 'ok' ? 'saved' : outcome === 'full' ? 'full' : 'failed')
      }
      setIds(list ? next : null)
      setLoading(false)
    })()
    return () => {
      live = false
    }
  }, [signedIn, actions, say])

  const toggle = useCallback(
    async (id: string, want?: boolean): Promise<SaveOutcome | 'login'> => {
      if (!signedIn) {
        try {
          sessionStorage.setItem(PENDING_KEY, id)
        } catch {
          // Without storage the visitor comes back signed in and presses it again.
        }
        requestLogin({ next: window.location.pathname + window.location.search, body: t('loginBody') })
        return 'login'
      }
      const current = idsRef.current
      const on = want ?? (current ? !current.has(id) : null)
      if (on === null) {
        say('failed')
        return 'error'
      }
      const flip = (set: ReadonlySet<string>, add: boolean) => {
        const next = new Set(set)
        if (add) next.add(id)
        else next.delete(id)
        return next
      }
      setIds((prev) => (prev ? flip(prev, on) : prev))
      const outcome = await actions.save(id, on)
      if (outcome !== 'ok') setIds((prev) => (prev ? flip(prev, !on) : prev))
      say(outcome === 'ok' ? (on ? 'saved' : 'removed') : outcome === 'full' ? 'full' : 'failed')
      return outcome
    },
    [signedIn, actions, t, say]
  )

  return (
    <FavoritesContext.Provider value={{ signedIn, ids, loading, toggle }}>
      <Toast.Provider label={t('toastLabel')} duration={3000} swipeDirection="right">
        {children}
        {message && (
          <Toast.Root
            key={message.key}
            type="background"
            onOpenChange={(open) => {
              if (!open) setMessage(null)
            }}
            className="pointer-events-none rounded-card border border-line-strong bg-pop px-4 py-3 shadow-sheet"
          >
            <Toast.Description className={`text-sm font-semibold ${message.kind === 'failed' || message.kind === 'full' ? 'text-warn' : ''}`}>
              {t(`toast.${message.kind}`)}
            </Toast.Description>
          </Toast.Root>
        )}
        <Toast.Viewport className="pointer-events-none fixed inset-x-4 bottom-4 z-[80] flex flex-col gap-2 outline-none sm:left-auto sm:right-6 sm:w-[320px]" />
      </Toast.Provider>
    </FavoritesContext.Provider>
  )
}

interface FavoriteButtonProps {
  id: string
  name: string
  size?: 'row' | 'panel'
}

export function FavoriteButton({ id, name, size = 'row' }: FavoriteButtonProps) {
  const t = useTranslations('store.favorite')
  const { signedIn, ids, loading, toggle } = useFavorites()
  const [busy, setBusy] = useState(false)
  const on = signedIn && (ids?.has(id) ?? false)
  // Pressed before the list arrives, it would not know which way to go.
  const waiting = loading

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t('remove', { name }) : t('add', { name })}
      aria-disabled={waiting || busy || undefined}
      data-favorite={id}
      onClick={async () => {
        if (waiting || busy) return
        setBusy(true)
        try {
          await toggle(id)
        } finally {
          setBusy(false)
        }
      }}
      className={`fav-btn ${size === 'panel' ? 'fav-btn-lg' : ''}`}
    >
      <Heart size={size === 'panel' ? 19 : 16} aria-hidden />
    </button>
  )
}

/** The dashboard's remove button: the list there is rendered on the server, so it refreshes. */
export function RemoveFavoriteButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations('site.dashboard')
  const router = useRouter()
  const { toggle } = useFavorites()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className="btn"
      aria-label={t('favRemoveLabel', { name })}
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const outcome = await toggle(id, false)
        if (outcome === 'ok') router.refresh()
        setBusy(false)
      }}
    >
      {t('favRemove')}
    </button>
  )
}
