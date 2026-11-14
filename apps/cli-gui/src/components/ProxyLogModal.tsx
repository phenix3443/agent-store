import { useEffect, useState } from 'react'
import type { LocalRelayConfig, RecentRequestRow } from '@as/types'
import { callRpc } from '../lib/rpc'
import { useT } from '../i18n'
import { agentLabel } from '../lib/usage'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from './ui/dialog'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { EmptyState, LoadingRows } from './ui/states'
import { cn } from './ui/cn'

interface ProxyLogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function dotColor(row: RecentRequestRow): string {
  if (row.statusCode < 400) return 'bg-provider'
  if (row.isFallback) return 'bg-warn'
  return 'bg-bad'
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function ProxyLogModal({ open, onOpenChange }: ProxyLogModalProps) {
  const t = useT()
  const [rows, setRows] = useState<RecentRequestRow[] | null>(null)
  const [localConfigs, setLocalConfigs] = useState<LocalRelayConfig[]>([])

  useEffect(() => {
    if (!open) return
    setRows(null)
    callRpc<RecentRequestRow[]>('getRecentRequests', [{ limit: 50 }]).then(setRows, () => setRows([]))
    callRpc<LocalRelayConfig[]>('listLocalConfigs').then(setLocalConfigs, () => undefined)
  }, [open])

  const addr = `127.0.0.1${localConfigs[0] ? `:${localConfigs[0].port}` : ''}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="wide">
        <DialogBody>
          <DialogTitle>{t('proxyLog.title')}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{addr}</span> · {t('proxyLog.sub')}
          </DialogDescription>
          {rows === null ? (
            <LoadingRows rows={4} label={t('ui.loading')} />
          ) : rows.length === 0 ? (
            <EmptyState title={t('proxyLog.empty')} />
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-box border border-line">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-2.5 border-b border-line px-3 py-2 text-xs last:border-b-0">
                  <span aria-hidden className={cn('h-[7px] w-[7px] flex-none rounded-full', dotColor(row))} />
                  <span className="w-[108px] flex-none font-mono text-[11px] text-fg-3">{timeLabel(row.createdAt)}</span>
                  <span className="w-[84px] flex-none font-semibold text-fg-2">{agentLabel(row.target)}</span>
                  <span className="min-w-0 flex-1 truncate font-mono">{row.model}</span>
                  <span className="font-mono text-[11px] text-fg-2">→ {row.providerSlug}</span>
                  {row.isFallback && <Badge tone="warn">{t('proxyLog.fallback')}</Badge>}
                  <span className={cn('w-[34px] flex-none text-right font-mono text-[11px]', row.statusCode < 400 ? 'text-fg-3' : 'text-bad')}>
                    {row.statusCode}
                  </span>
                  <span className="w-[56px] flex-none text-right font-mono text-[11px] text-fg-3">{row.latencyMs}ms</span>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button>{t('ui.close')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
