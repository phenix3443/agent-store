'use client'

import { Check } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { askInstalled, shouldAskClient } from '@/lib/local-client'

const BATCH = 100
const RECHECK_MS = 5000

interface LocalInstalledValue {
  installed: ReadonlySet<string>
  watch: (id: string) => () => void
}

const LocalInstalledContext = createContext<LocalInstalledValue>({ installed: new Set(), watch: () => () => {} })

/**
 * Asks the desktop client running on this machine which of the shown items are installed.
 * When it cannot be asked, nothing is marked and every page looks as it does without it.
 */
export function LocalInstalledProvider({ children }: { children: React.ReactNode }) {
  const [installed, setInstalled] = useState<ReadonlySet<string>>(new Set())
  const watched = useRef(new Map<string, number>())
  const asked = useRef(new Set<string>())
  const allowed = useRef<Promise<boolean> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const lastCheck = useRef(0)

  const check = useCallback(async (all: boolean) => {
    allowed.current ??= shouldAskClient()
    if (!(await allowed.current)) return
    const ids = [...watched.current.keys()].filter((id) => all || !asked.current.has(id))
    if (ids.length === 0) return
    for (const id of ids) asked.current.add(id)
    lastCheck.current = Date.now()
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH)
      const found = await askInstalled(chunk)
      if (!found) {
        // Not running, or the browser refused: ask again only when the visitor comes back.
        for (const id of ids) asked.current.delete(id)
        allowed.current = Promise.resolve(false)
        return
      }
      setInstalled((prev) => {
        const next = new Set(prev)
        for (const id of chunk) {
          if (found.has(id)) next.add(id)
          else next.delete(id)
        }
        return next
      })
    }
  }, [])

  const watch = useCallback(
    (id: string) => {
      watched.current.set(id, (watched.current.get(id) ?? 0) + 1)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void check(false), 50)
      return () => {
        const n = (watched.current.get(id) ?? 1) - 1
        if (n > 0) watched.current.set(id, n)
        else watched.current.delete(id)
      }
    },
    [check]
  )

  // Back from the client (an install just finished there), the answers may have changed.
  useEffect(() => {
    function onFocus() {
      if (Date.now() - lastCheck.current < RECHECK_MS) return
      allowed.current = null
      void check(true)
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearTimeout(timer.current)
    }
  }, [check])

  const value = useMemo(() => ({ installed, watch }), [installed, watch])
  return <LocalInstalledContext.Provider value={value}>{children}</LocalInstalledContext.Provider>
}

/** Whether the desktop client on this machine reports the item installed. */
export function useInstalledHere(id: string): boolean {
  const { installed, watch } = useContext(LocalInstalledContext)
  useEffect(() => watch(id), [id, watch])
  return installed.has(id)
}

export function InstalledBadge({ id }: { id: string }) {
  const t = useTranslations('store.install')
  if (!useInstalledHere(id)) return null
  return (
    <span className="installed-badge" title={t('installedHereTitle')}>
      <Check size={12} strokeWidth={2.5} aria-hidden />
      {t('installedHere')}
    </span>
  )
}
