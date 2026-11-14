import { useEffect, useMemo, useState } from 'react'
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

  const [updates, setUpdates] = useState<Map<string, UpdateAvailable>>(new Map())

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const list = (await callRpc<InstalledItem[]>('list')).filter((i) => i.category === kind)
        const [details, statuses] = await Promise.all([
          Promise.all(list.map((i) => callRpc<ItemDetail>('info', [i.slug]))),
          kind === 'mcp'
            ? Promise.all(list.map((i) => callRpc<TargetStatus[]>('getTargetStatus', [i.slug]).catch(() => undefined)))
            : Promise.resolve([] as (TargetStatus[] | undefined)[]),
        ])
        if (cancelled) return
        setRows(details.map((d, i) => ({ ...list[i], ...d, status: statuses[i] })))
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    // Asks the catalog about every entry, so it can take far longer than the rows; they don't wait for it.
    callRpc<UpdateAvailable[]>('checkUpdates').then(
      (u) => !cancelled && setUpdates(new Map(u.map((x) => [x.slug, x]))),
      () => undefined
    )
    return () => {
      cancelled = true
    }
  }, [kind, installedVersion, nonce])

  const merged = useMemo(() => rows.map((r) => ({ ...r, update: updates.get(r.slug) })), [rows, updates])

  return { rows: merged, loading, error, reload: () => setNonce((n) => n + 1) }
}
