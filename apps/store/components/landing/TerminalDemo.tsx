'use client'

import * as Tabs from '@radix-ui/react-tabs'
import { useTranslations } from 'next-intl'
import { TERMINAL_SESSIONS } from './terminal-sessions'

export function TerminalDemo() {
  const t = useTranslations('site.home.terminal')

  return (
    <Tabs.Root defaultValue={TERMINAL_SESSIONS[0].id} className="min-w-0">
      <Tabs.List aria-label={t('tabsLabel')} className="flex flex-wrap border border-b-0 border-ink">
        {TERMINAL_SESSIONS.map((s) => (
          <Tabs.Trigger
            key={s.id}
            value={s.id}
            className="min-h-10 border-r border-ink px-4 font-mono text-[13px] text-ink-2 transition-colors last:border-r-0 hover:text-ink focus-visible:outline-offset-[-3px] data-[state=active]:bg-ink data-[state=active]:text-on-ink"
          >
            {s.id}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {TERMINAL_SESSIONS.map((s) => (
        <Tabs.Content key={s.id} value={s.id} className="border border-ink bg-paper focus-visible:outline-offset-2">
          <pre className="whitespace-pre-wrap break-words px-4 py-4 font-mono text-[13px] leading-6 sm:px-5">
            <code>
              {s.steps.map((step, i) => (
                <span key={step.command} className="block">
                  {i > 0 && '\n'}
                  <span className="text-ink-2">$ </span>
                  <span className="font-medium">{step.command}</span>
                  {'\n'}
                  {step.output}
                </span>
              ))}
            </code>
          </pre>
        </Tabs.Content>
      ))}
    </Tabs.Root>
  )
}
