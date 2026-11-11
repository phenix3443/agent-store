'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useTransition } from 'react'

type Patch = Record<string, string | null>

export function buildStoreHref(current: string, patch: Patch): string {
  const params = new URLSearchParams(current)
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '') params.delete(key)
    else params.set(key, value)
  }
  const query = params.toString()
  return query ? `/store?${query}` : '/store'
}

/**
 * Filters, sort and search all live in the URL. `replace` keeps typing and
 * filter toggling out of the back-button history.
 */
export function useStoreQuery() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // The list is rendered by a server component in another subtree, so the
  // pending state reaches it through an attribute that globals.css styles.
  useEffect(() => {
    const root = document.documentElement
    if (isPending) root.dataset.storePending = ''
    else delete root.dataset.storePending
    return () => {
      delete root.dataset.storePending
    }
  }, [isPending])

  const setParams = useCallback(
    (patch: Patch) => {
      const href = buildStoreHref(searchParams.toString(), patch)
      startTransition(() => {
        if (pathname === '/store') router.replace(href, { scroll: false })
        else router.push(href)
      })
    },
    [pathname, router, searchParams]
  )

  return { setParams, isPending, searchParams, onStore: pathname === '/store' }
}
