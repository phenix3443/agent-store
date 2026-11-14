import { useState } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import type { ProviderTestOutcome, ProviderTestResult } from '@as/types'
import { callRpc, errorText } from '../../lib/rpc'
import { TARGET_LABEL } from '../../lib/agents'
import { useTerminalLog } from '../../state/TerminalLog'
import { useT } from '../../i18n'
import { Button } from '../ui/button'
import { Banner, Spinner } from '../ui/states'
import { cn } from '../ui/cn'

const WARN: ProviderTestOutcome[] = ['rate-limited', 'upstream-error', 'timeout']

/** 测试连接: the request the relay would send, with an empty body; see client-core relay/provider-test.ts. */
export function ProviderTest({ slug, disabledReason }: { slug: string; disabledReason?: string }) {
  const t = useT()
  const { appendLine } = useTerminalLog()
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<ProviderTestResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    appendLine(`$ aas test ${slug}`)
    try {
      const r = await callRpc<ProviderTestResult[]>('testProvider', [slug])
      setResults(r)
      for (const x of r) appendLine(`${x.ok ? '✓' : '✗'} ${TARGET_LABEL[x.target]}: ${t(`provTest.o.${x.outcome}`)}`, x.ok ? 'green' : 'red')
    } catch (err) {
      setResults(null)
      setError(errorText(err))
      appendLine(`✗ ${errorText(err)}`, 'red')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="kind" disabled={running || !!disabledReason} onClick={() => void run()}>
          {running && <Spinner className="h-3.5 w-3.5" />}
          {running ? t('provTest.running') : t('provTest.run')}
        </Button>
        {disabledReason && <span className="text-[11.5px] text-fg-3">{disabledReason}</span>}
      </div>
      <p className="mt-1.5 text-[11.5px] text-fg-3">{t('provTest.d')}</p>
      <div role="status" aria-live="polite">
        {error && (
          <div className="mt-2.5">
            <Banner tone="error" title={t('provTest.failed')}>
              <p>{error}</p>
            </Banner>
          </div>
        )}
        {results && results.length === 0 && <p className="mt-2.5 text-xs text-fg-2">{t('provTest.none')}</p>}
        {results && results.length > 0 && (
          <ul className="mt-2.5 flex flex-col overflow-hidden rounded-box border border-line">
            {results.map((r) => {
              const warn = WARN.includes(r.outcome)
              const Icon = r.ok ? Check : warn ? AlertTriangle : X
              const facts = [r.statusCode !== undefined ? `HTTP ${r.statusCode}` : null, r.latencyMs !== undefined ? `${r.latencyMs} ms` : null].filter(Boolean).join(' · ')
              return (
                <li key={r.target} className="flex gap-2.5 border-b border-line px-3 py-2.5 last:border-b-0">
                  <Icon size={15} className={cn('mt-0.5 flex-none', r.ok ? 'text-provider' : warn ? 'text-warn' : 'text-bad')} aria-hidden />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <b className="text-[12.5px] font-semibold text-fg">{TARGET_LABEL[r.target]}</b>
                      <span className={cn(r.ok ? 'text-provider' : warn ? 'text-warn' : 'text-bad')}>{t(`provTest.o.${r.outcome}`)}</span>
                      {facts && <span className="font-mono text-[11px] text-fg-3">{facts}</span>}
                    </div>
                    <code className="mt-0.5 block break-all font-mono text-[11px] text-fg-3">POST {r.url}</code>
                    {r.message && <p className="mt-0.5 break-words text-fg-2">{r.message}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
