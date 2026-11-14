import { useCallback, useEffect, useState } from 'react'
import type { ProviderHealth } from '@as/types'
import { callRpc } from '../lib/rpc'
import { useT, type TFn } from '../i18n'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardTitle } from './ui/card'
import { cn } from './ui/cn'
import { ProBadge } from './ProGate'

const ERROR_KEYS: Record<string, string> = {
  auth: 'errAuth',
  rate_limit: 'errRate',
  overload: 'errOverload',
  server: 'errServer',
  network: 'errNetwork',
}

function errorLabel(kind: string | null | undefined, t: TFn): string {
  const k = ERROR_KEYS[kind ?? '']
  return k ? t(`health.${k}`) : (kind ?? '')
}

function remaining(cooldownUntil: number | null, t: TFn): string {
  if (!cooldownUntil) return ''
  const secs = Math.max(0, Math.round((cooldownUntil - Date.now()) / 1000))
  return secs >= 60 ? `${Math.round(secs / 60)} ${t('health.minutes')}` : `${secs} ${t('health.seconds')}`
}

export function ProviderHealthCard() {
  const t = useT()
  const [health, setHealth] = useState<ProviderHealth[] | null>(null)

  const refresh = useCallback(() => {
    callRpc<ProviderHealth[]>('getProviderHealth')
      .then((h) => setHealth(h ?? []))
      .catch(() => setHealth((prev) => prev ?? []))
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  async function reset(slug: string) {
    await callRpc('resetProviderHealth', [slug]).catch(() => undefined)
    refresh()
  }

  const coolingCount = health?.filter((h) => h.status === 'cooling').length ?? 0

  return (
    <Card>
      <CardTitle>
        {t('health.title')}
        <ProBadge />
        {coolingCount > 0 && (
          <Badge tone="warn">
            {coolingCount} {t('health.coolingSuffix')}
          </Badge>
        )}
      </CardTitle>
      {health && health.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-fg-3">{t('health.empty')}</p>
      ) : (
        <ul className="mt-2.5 flex flex-col overflow-hidden rounded-[11px] border border-line">
          {(health ?? []).map((h) => (
            <li key={h.providerSlug} className="flex min-h-[44px] items-center gap-2.5 border-b border-line px-3 py-2 last:border-b-0">
              <i
                aria-hidden
                className={cn(
                  'mx-[3px] h-2 w-2 flex-none rounded-full',
                  h.status === 'up' ? 'bg-provider shadow-[0_0_0_3px_rgb(var(--provider-rgb)/0.18)]' : 'bg-warn'
                )}
              />
              <div className="min-w-0 flex-1 leading-tight">
                <b className="block truncate font-mono text-[12.5px] font-semibold">{h.providerSlug}</b>
                <small className="block truncate text-[11.5px] text-fg-3">
                  {h.status === 'cooling'
                    ? `${errorLabel(h.lastErrorKind, t)}${h.lastStatus ? ` (${h.lastStatus})` : ''} · ${t('health.cooldown')} ${remaining(h.cooldownUntil, t)}`
                    : t('health.healthy')}
                </small>
              </div>
              {h.status === 'cooling' && (
                <Button size="sm" onClick={() => void reset(h.providerSlug)}>
                  {t('health.recoverNow')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
