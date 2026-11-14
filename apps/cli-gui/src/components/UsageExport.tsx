import { useState } from 'react'
import { Download } from 'lucide-react'
import { callRpc } from '../lib/rpc'
import { useT } from '../i18n'
import { Button } from './ui/button'
import { RevealButton } from './ui/reveal'

/** Exports the last 30 days of usage rollups to a CSV/JSON file via the engine. */
export function UsageExport() {
  const t = useT()
  const [message, setMessage] = useState<{ text: string; failed: boolean; path?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function doExport(format: 'csv' | 'json') {
    if (busy) return
    setBusy(true)
    try {
      const path = await callRpc<string>('exportUsage', [format, 30])
      setMessage({ text: t('usage.exported').replace('{path}', path), failed: false, path })
    } catch {
      setMessage({ text: t('usage.exportFailed'), failed: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {(['csv', 'json'] as const).map((fmt) => (
          <Button key={fmt} size="sm" onClick={() => void doExport(fmt)} disabled={busy}>
            <Download />
            {t('usage.export').replace('{fmt}', fmt.toUpperCase())}
          </Button>
        ))}
        {message?.path && <RevealButton path={message.path} />}
      </div>
      <p role="status" className={`mt-2 break-all text-xs ${message?.failed ? 'text-bad' : 'text-fg-3'}`}>
        {message ? message.text : t('usage.exportHint')}
      </p>
    </div>
  )
}
