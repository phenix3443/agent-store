import { useEffect, useState } from 'react'
import type { InstalledItem, ItemDetail, TargetStatus, UpdateAvailable } from '@as/types'
import { callRpc } from './rpc'
import { useAppState } from '../state/AppState'

export type Kind = InstalledItem['category']

export interface InstalledRow extends ItemDetail {
  update?: UpdateAvailable
  /** Per-agent state with the reason enabling is refused; MCP rows only (one more sidecar call each). */
  status?: TargetStatus[]
}

export interface InstalledState {
  rows: InstalledRow[]
  loading: boolean
  error: string | null
  reload: () => void
}

/** Installed entries of one kind with their detail, refreshed whenever an install, toggle or uninstall bumps the version. */
export function useInstalled(kind: Kind): InstalledState {
  const { installedVersion } = useAppState()
  const [rows, setRows] = useState<InstalledRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const list = (await callRpc<InstalledItem[]>('list')).filter((i) => i.category === kind)
        const [details, statuses, updates] = await Promise.all([
          Promise.all(list.map((i) => callRpc<ItemDetail>('info', [i.slug]))),
          kind === 'mcp'
            ? Promise.all(list.map((i) => callRpc<TargetStatus[]>('getTargetStatus', [i.slug]).catch(() => undefined)))
            : Promise.resolve([] as (TargetStatus[] | undefined)[]),
          callRpc<UpdateAvailable[]>('checkUpdates').catch(() => [] as UpdateAvailable[]),
        ])
        if (cancelled) return
        const bySlug = new Map(updates.map((u) => [u.slug, u]))
        setRows(details.map((d, i) => ({ ...list[i], ...d, update: bySlug.get(d.slug), status: statuses[i] })))
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [kind, installedVersion, nonce])

  return { rows, loading, error, reload: () => setNonce((n) => n + 1) }
}
