import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import type { LocalRelayConfig, RecentRequestRow } from '@as/types'
import { X } from 'lucide-react'
import { callRpc } from '../lib/rpc'
import { useT } from '../i18n'

interface ProxyLogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function statusColor(row: RecentRequestRow): string {
  if (row.statusCode < 400) return 'var(--green)'
  if (row.isFallback) return 'var(--amber)'
  return 'var(--red)'
}

export function ProxyLogModal({ open, onOpenChange }: ProxyLogModalProps) {
  const t = useT()
  const [rows, setRows] = useState<RecentRequestRow[]>([])
  const [localConfigs, setLocalConfigs] = useState<LocalRelayConfig[]>([])

  useEffect(() => {
    if (!open) return
    callRpc<RecentRequestRow[]>('getRecentRequests', [{ limit: 20 }]).then(setRows)
    callRpc<LocalRelayConfig[]>('listLocalConfigs').then(setLocalConfigs)
  }, [open])

  const addr = `127.0.0.1${localConfigs[0] ? `:${localConfigs[0].port}` : ''}`

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[85vh] w-[620px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-store-border bg-store-content p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold text-store-text">{t('proxyLog.title')}</Dialog.Title>
              <p className="mt-0.5 font-mono text-xs text-store-text-3">{addr} · {t('proxyLog.sub')}</p>
            </div>
            <Dialog.Close aria-label={t('window.close')} className="text-store-text-2 hover:text-store-text">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-1">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-store-panel">
                <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full" style={{ background: statusColor(row) }} />
                <span className="w-[58px] flex-shrink-0 font-mono text-[11px] text-store-text-3">{row.createdAt}</span>
                <span className="w-[92px] flex-shrink-0 text-[11.5px] font-semibold text-store-text-2">{row.target}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-store-text">{row.model}</span>
                <span className="font-mono text-[11px] text-store-accent">→ {row.providerSlug}</span>
                {row.isFallback ? (
                  <span
                    className="rounded text-[9.5px] font-bold text-store-amber"
                    style={{ background: 'rgba(240,179,74,0.16)', padding: '1px 6px' }}
                  >
                    {t('proxyLog.fallback')}
                  </span>
                ) : null}
                <span className="w-[52px] flex-shrink-0 text-right font-mono text-[11px] text-store-text-3">{row.latencyMs}ms</span>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
