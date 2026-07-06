import { useState } from 'react'
import { Download } from 'lucide-react'
import { callRpc } from '../lib/rpc'

/** Exports the last 30 days of usage rollups to a CSV/JSON file via the engine. */
export function UsageExport() {
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function doExport(format: 'csv' | 'json') {
    if (busy) return
    setBusy(true)
    try {
      const path = await callRpc<string>('exportUsage', [format, 30])
      setMessage(`已导出到 ${path}`)
    } catch {
      setMessage('导出失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-store-border bg-store-panel px-4 py-3">
      <Download size={15} className="text-store-text-2" />
      <span className="flex-1 truncate text-xs text-store-text-2">{message ?? '导出近 30 天用量账单'}</span>
      {(['csv', 'json'] as const).map((fmt) => (
        <button
          key={fmt}
          type="button"
          onClick={() => doExport(fmt)}
          disabled={busy}
          className="rounded-md border border-store-border-strong px-2.5 py-1 text-xs font-medium text-store-text hover:border-store-accent hover:text-store-accent disabled:opacity-50"
        >
          {fmt.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
