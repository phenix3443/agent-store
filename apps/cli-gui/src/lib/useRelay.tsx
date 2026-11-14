import { useCallback, useEffect, useState } from 'react'
import type { RelayStatus } from '@as/types'
import { callRpc, errorText } from './rpc'
import { AGENTS, joinNames } from './agents'
import { AGENT_RELAY_ADDRESS, failedListeners, relayState, routedTargets } from './relay'
import { useAppState } from '../state/AppState'
import { useTerminalLog } from '../state/TerminalLog'
import { useI18n } from '../i18n'
import { Button } from '../components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../components/ui/dialog'
import { toast } from '../components/ui/toast'

export interface RelayControl {
  status: RelayStatus | null
  loadFailed: boolean
  busy: 'start' | 'stop' | null
  /** Why the last start or stop call failed, or why the relay exited right after starting. */
  error: string | null
  start: () => Promise<void>
  /** Stops at once, or first asks when an agent's config still points at the relay. */
  requestStop: () => void
  dialog: JSX.Element
}

// Shared by every useRelay: a "not listening" line in the activity log waits for a later
// "listening" line, even when the port frees up on its own and another screen sees it.
let failureLogged = false

function listeningOn(status: RelayStatus): string {
  return (status.listeners ?? []).filter((l) => l.listening).map((l) => `127.0.0.1:${l.port}`).join(', ') || AGENT_RELAY_ADDRESS
}

/** The relay's status, refreshed after every install-level change, with start and stop. */
export function useRelay(active = true): RelayControl {
  const { t, locale } = useI18n()
  const { installedVersion, bumpInstalledVersion } = useAppState()
  const { appendLine } = useTerminalLog()
  const [status, setStatus] = useState<RelayStatus | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState<'start' | 'stop' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!status) return
    const state = relayState(status)
    if (failureLogged && state === 'listening') {
      failureLogged = false
      appendLine(`✓ ${t('relayCtl.logListening').replace('{0}', listeningOn(status))}`, 'green')
    } else if (failureLogged && state === 'stopped') {
      failureLogged = false
    }
  }, [status, appendLine, t])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    callRpc<RelayStatus>('getRelayStatus').then(
      (s) => {
        if (cancelled) return
        setStatus(s)
        setLoadFailed(false)
      },
      () => !cancelled && setLoadFailed(true)
    )
    return () => {
      cancelled = true
    }
  }, [active, installedVersion])

  const run = useCallback(
    async (action: 'start' | 'stop') => {
      setBusy(action)
      setError(null)
      appendLine(`$ aas relay ${action}`)
      try {
        const next = await callRpc<RelayStatus>(action === 'start' ? 'startRelay' : 'stopRelay')
        setStatus(next)
        if (action === 'start' && !next.running) {
          setError(t('relayCtl.exited'))
          appendLine(`✗ ${t('relayCtl.exited')}`, 'red')
          toast.error(t('relayCtl.exited'))
        } else if (action === 'start' && relayState(next) === 'failed') {
          failureLogged = true
          appendLine(`✗ ${failedListeners(next).map((l) => `${l.port}: ${l.error ?? ''}`).join('; ')}`, 'red')
          toast.error(t('relayCtl.startedNotListening'))
        } else {
          if (action === 'stop') failureLogged = false
          appendLine(
            `✓ ${action === 'start' ? t('relayCtl.logListening').replace('{0}', listeningOn(next)) : t('relayCtl.toastOff')}`,
            'green'
          )
          toast(t(action === 'start' ? 'relayCtl.toastOn' : 'relayCtl.toastOff'))
        }
      } catch (err) {
        setError(errorText(err))
        appendLine(`✗ ${errorText(err)}`, 'red')
        toast.error(t(action === 'start' ? 'relayCtl.startFailed' : 'relayCtl.stopFailed'))
      } finally {
        setBusy(null)
        bumpInstalledVersion()
      }
    },
    [appendLine, bumpInstalledVersion, t]
  )

  const routed = routedTargets(status)
  const names = joinNames(
    AGENTS.filter((a) => routed.includes(a.id)).map((a) => a.name),
    locale
  )

  const dialog = (
    <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
      <DialogContent data-kind="provider">
        <DialogBody>
          <DialogTitle>{t('relayCtl.stopTitle')}</DialogTitle>
          <DialogDescription>
            {t('relayCtl.stopBody').replace('{0}', names).replace('{1}', AGENT_RELAY_ADDRESS)}
          </DialogDescription>
          <p className="mt-2.5 text-[13px] text-fg-2">{t('relayCtl.stopRestore')}</p>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirming(false)
              void run('stop')
            }}
          >
            {t('relayCtl.stop')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return {
    status,
    loadFailed,
    busy,
    error,
    start: () => run('start'),
    requestStop: () => (routed.length > 0 ? setConfirming(true) : void run('stop')),
    dialog,
  }
}
