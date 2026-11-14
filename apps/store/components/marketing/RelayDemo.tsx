'use client'

import { useEffect, useRef, useState } from 'react'
import * as Switch from '@radix-ui/react-switch'
import { useTranslations } from 'next-intl'

const AGENTS = ['Claude Code', 'Codex'] as const
// Free fails over across two providers, so the diagram draws two.
const PROVIDERS = ['A', 'B'] as const
// RELAY_PORT in client-core relay/server.ts.
export const RELAY_ADDRESS = '127.0.0.1:18780'

type Phase = 'idle' | 'request' | 'first' | 'second'
interface LogLine {
  id: number
  agent: string
  to: string
  status: 200 | 503
}

const STEP_MS = 700

/**
 * A request from an agent through the local relay to the first provider; with the switch
 * on, the first answers 503 and the relay retries the second. Plays in a loop unless the
 * visitor prefers reduced motion, which shows the failover as a still.
 */
export function RelayDemo() {
  const t = useTranslations('site.client.relay')
  const [fail, setFail] = useState(true)
  const [phase, setPhase] = useState<Phase>('second')
  const [agent, setAgent] = useState(0)
  const [log, setLog] = useState<LogLine[]>([])
  const nextId = useRef(0)
  const names = PROVIDERS.map((x) => t('provider', { x }))

  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const push = (line: Omit<LogLine, 'id'>) =>
      setLog((l) => [...l, { ...line, id: nextId.current++ }].slice(-3))
    if (still) {
      setPhase(fail ? 'second' : 'first')
      setLog([])
      if (fail) push({ agent: AGENTS[0], to: names[0], status: 503 })
      push({ agent: AGENTS[0], to: fail ? t('retry', { name: names[1] }) : names[0], status: 200 })
      return
    }
    let n = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
    function round() {
      const a = n++ % AGENTS.length
      setAgent(a)
      setPhase('request')
      at(STEP_MS, () => {
        setPhase('first')
        push({ agent: AGENTS[a], to: names[0], status: fail ? 503 : 200 })
      })
      if (fail) {
        at(STEP_MS * 2, () => {
          setPhase('second')
          push({ agent: AGENTS[a], to: t('retry', { name: names[1] }), status: 200 })
        })
      }
      at(STEP_MS * (fail ? 2 : 1) + 1600, round)
    }
    round()
    return () => timers.forEach(clearTimeout)
    // names and t only change with the locale, which reloads the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fail])

  const firstStatus = phase === 'first' || phase === 'second' ? (fail ? 'err' : 'ok') : undefined
  const secondStatus = phase === 'second' ? 'ok' : undefined

  return (
    <div>
      <div className="mb-6 flex items-center gap-2.5 text-sm text-fg-2">
        <Switch.Root checked={fail} onCheckedChange={setFail} className="switch" aria-label={t('fail')}>
          <Switch.Thumb asChild>
            <span />
          </Switch.Thumb>
        </Switch.Root>
        <span aria-hidden>{t('fail')}</span>
      </div>
      <div
        role="img"
        aria-label={t('alt')}
        className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_28px_minmax(0,1.1fr)_minmax(0,1.3fr)] sm:items-center"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-1 sm:gap-3">
          {AGENTS.map((name, i) => (
            <div key={name} className="relay-node" data-status={phase !== 'idle' && agent === i ? 'req' : undefined}>
              <b>{name}</b>
            </div>
          ))}
        </div>
        <div className="relay-wire mx-auto h-6 w-0.5 sm:h-0.5 sm:w-full" data-lit={phase !== 'idle' ? 'req' : undefined} />
        <div className="relay-node relay-hub">
          <b>{t('relay')}</b>
          <small>{RELAY_ADDRESS}</small>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-1 sm:gap-3">
          {names.map((name, i) => {
            const status = i === 0 ? firstStatus : secondStatus
            return (
              <div key={name} className="flex flex-col items-stretch sm:grid sm:grid-cols-[28px_minmax(0,1fr)] sm:items-center">
                <div className="relay-wire mx-auto h-6 w-0.5 sm:h-0.5 sm:w-full" data-lit={status} />
                <div className="relay-node" data-status={status}>
                  <b>{name}</b>
                  <small>{status === 'err' ? '503' : status === 'ok' ? '200' : `Level ${i + 1}`}</small>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <ul aria-hidden className="mt-4 min-h-[5.7em] font-mono text-[12.5px] leading-[1.9] text-fg-3">
        {log.map((l) => (
          <li key={l.id} className="flex gap-2.5 overflow-hidden whitespace-nowrap">
            <b className="font-medium text-fg-2">{l.agent}</b>
            <span>→ {l.to}</span>
            <span className={l.status === 200 ? 'text-provider' : 'text-bad'}>{l.status}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
