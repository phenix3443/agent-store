import { Play, Square } from 'lucide-react'
import type { RelayStatus } from '@as/types'
import { useI18n } from '../../i18n'
import { AGENTS, joinNames } from '../../lib/agents'
import { AGENT_RELAY_ADDRESS, failedListeners, relayState, routedTargets } from '../../lib/relay'
import type { RelayControl } from '../../lib/useRelay'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Banner, Spinner } from '../ui/states'
import { cn } from '../ui/cn'
import { ErrorDetails } from '../library/parts'

export function RelayDot({ status }: { status: RelayStatus | null }) {
  const state = relayState(status)
  return (
    <i
      aria-hidden
      className={cn(
        'mx-0.5 h-2 w-2 flex-none rounded-full',
        state === 'listening' || state === 'unreported'
          ? 'bg-provider shadow-[0_0_0_3px_rgb(var(--provider-rgb)/0.18),0_0_10px_rgb(var(--provider-rgb)/0.8)]'
          : state === 'failed'
            ? 'bg-warn'
            : 'bg-fg-3'
      )}
    />
  )
}

export function RelayBadge({ status }: { status: RelayStatus }) {
  const { t } = useI18n()
  const state = relayState(status)
  if (state === 'stopped') return <Badge>{t('relayCtl.stopped')}</Badge>
  if (state === 'failed') return <Badge tone="warn">{t('relayCtl.notListening')}</Badge>
  return <Badge tone="ok">{t('relayCtl.running')}</Badge>
}

export function RelayToggleButton({ relay }: { relay: RelayControl }) {
  const { t } = useI18n()
  if (!relay.status) return null
  const running = relay.status.running
  const busy = relay.busy !== null
  return (
    <Button size="sm" variant="kind" disabled={busy} onClick={() => (running ? relay.requestStop() : void relay.start())}>
      {busy ? <Spinner className="h-3.5 w-3.5" /> : running ? <Square /> : <Play />}
      {relay.busy === 'start' ? t('relayCtl.starting') : relay.busy === 'stop' ? t('relayCtl.stopping') : t(running ? 'relayCtl.stop' : 'relayCtl.start')}
    </Button>
  )
}

/** Each port the relay listens on, or why it can't. */
export function RelayListen({ status }: { status: RelayStatus }) {
  const { t } = useI18n()
  if (!status.running) return <span className="font-mono text-[13px] font-semibold text-fg-3">—</span>
  if (!status.listeners) {
    return (
      <span className="text-xs text-fg-2">
        <span className="font-mono text-[13px] font-semibold text-fg">{AGENT_RELAY_ADDRESS}</span> · {t('relayCtl.unreported')}
      </span>
    )
  }
  return (
    <span className="flex flex-col gap-0.5">
      {status.listeners.map((l) => (
        <span key={l.id} className="flex items-center gap-1.5 text-xs">
          <span className={cn('font-mono text-[13px] font-semibold', !l.listening && 'text-warn')}>127.0.0.1:{l.port}</span>
          {!l.listening && <span className="text-warn">{t('relayCtl.notListening')}</span>}
        </span>
      ))}
    </span>
  )
}

/** Start failures, ports that would not bind, and what a stopped relay means for the agents. */
export function RelayNotices({ relay }: { relay: RelayControl }) {
  const { t, locale } = useI18n()
  const status = relay.status
  if (!status) return null
  const failed = failedListeners(status)
  const routed = routedTargets(status)
  const routedNames = joinNames(
    AGENTS.filter((a) => routed.includes(a.id)).map((a) => a.name),
    locale
  )
  const notices: JSX.Element[] = []
  if (relay.error) {
    notices.push(
      <Banner key="error" tone="error" title={t('relayCtl.actionFailed')}>
        <p className="text-fg">{relay.error}</p>
      </Banner>
    )
  }
  for (const l of failed) {
    notices.push(
      <Banner key={l.id} tone="error" title={t(l.code === 'EADDRINUSE' ? 'relayCtl.portBusyT' : 'relayCtl.portFailedT').replace('{0}', String(l.port))}>
        <p className="text-fg">{t('relayCtl.portRetry')}</p>
        <ErrorDetails detail={[l.code, l.error].filter(Boolean).join(': ')} />
      </Banner>
    )
  }
  if (!status.running) {
    notices.push(
      <Banner key="stopped" tone="warn">
        <p className="text-fg">
          {routed.length > 0
            ? t('relayCtl.stoppedRouted').replace('{0}', routedNames).replace('{1}', AGENT_RELAY_ADDRESS)
            : t('relayCtl.stoppedIdle')}
        </p>
      </Banner>
    )
  }
  if (notices.length === 0) return null
  return <div className="mt-3 flex flex-col gap-2">{notices}</div>
}

/** What starting, enabling, disabling and stopping do to the agents' configs, as the engine does it. */
export function RelayHowItWorks() {
  const { t } = useI18n()
  return (
    <details className="group mt-3 text-xs text-fg-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 hover:text-fg-2 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="transition-transform group-open:rotate-90">
          ›
        </span>
        {t('relayCtl.howT')}
      </summary>
      <ul className="mt-2 flex max-w-[78ch] list-disc flex-col gap-1.5 pl-5 text-fg-2">
        <li>{t('relayCtl.howStart')}</li>
        <li>{t('relayCtl.howEnable').replace('{0}', AGENT_RELAY_ADDRESS)}</li>
        <li>{t('relayCtl.howDisable')}</li>
        <li>{t('relayCtl.howStop')}</li>
      </ul>
    </details>
  )
}
