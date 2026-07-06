import { useEffect, useState } from 'react'
import type { Item, ItemDetail } from '@as/types'
import { callRpc } from './rpc'
import { useAppState } from '../state/AppState'

export type SelectedDetail = (ItemDetail & { installed: true }) | (Item & { installed: false })

export function useSelectedDetail(): SelectedDetail | null {
  const { selectedSlug, installedVersion } = useAppState()
  const [detail, setDetail] = useState<SelectedDetail | null>(null)

  useEffect(() => {
    if (!selectedSlug) {
      setDetail(null)
      return
    }
    let cancelled = false
    async function load() {
      try {
        const info = await callRpc<ItemDetail>('info', [selectedSlug])
        if (!cancelled) setDetail({ ...info, installed: true })
      } catch {
        const items = await callRpc<Item[]>('search', [''])
        const found = items.find((i) => i.slug === selectedSlug)
        if (!cancelled) setDetail(found ? { ...found, installed: false } : null)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedSlug, installedVersion])

  return detail
}
