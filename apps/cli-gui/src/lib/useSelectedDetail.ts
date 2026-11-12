import { useEffect, useState } from 'react'
import type { CatalogResourceDetail, InstalledItem, Item, ItemDetail } from '@as/types'
import { callRpc } from './rpc'
import { resourceItem } from './catalog'
import { useAppState } from '../state/AppState'

export type SelectedDetail =
  | (ItemDetail & { installed: true; resource?: undefined })
  | (Item & { installed: false; resource: CatalogResourceDetail })

/**
 * The selection is an installed slug or a catalog id. An installed entry shows
 * what is on disk; anything else shows the catalog entry and its install preview.
 */
export function useSelectedDetail(): SelectedDetail | null {
  const { selectedSlug, installedVersion } = useAppState()
  const [detail, setDetail] = useState<SelectedDetail | null>(null)

  useEffect(() => {
    const ref = selectedSlug
    if (!ref) {
      setDetail(null)
      return
    }
    let cancelled = false
    async function installedSlug(): Promise<string | null> {
      if (!ref!.includes(':')) return ref
      const list = await callRpc<InstalledItem[]>('list').catch(() => [] as InstalledItem[])
      return list.find((e) => e.resourceId === ref)?.slug ?? null
    }
    async function load() {
      const slug = await installedSlug()
      if (slug) {
        try {
          const info = await callRpc<ItemDetail>('info', [slug])
          if (!cancelled) setDetail({ ...info, installed: true })
          return
        } catch {
          // Not installed: the catalog has it, or nothing does.
        }
      }
      try {
        const resource = await callRpc<CatalogResourceDetail>('getResource', [ref])
        if (!cancelled) setDetail({ ...resourceItem(resource), installed: false, resource })
      } catch {
        if (!cancelled) setDetail(null)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selectedSlug, installedVersion])

  return detail
}
