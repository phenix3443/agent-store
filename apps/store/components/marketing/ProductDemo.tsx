'use client'

import { useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { BarChart3, MousePointerClick, Route, Server } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppShot, SHOTS, WindowFrame } from './Window'

export const DEMO_VIEWS = [
  { id: 'install', kind: 'skill', Icon: MousePointerClick, shot: SHOTS.install },
  { id: 'mcp', kind: 'mcp', Icon: Server, shot: SHOTS.mcp },
  { id: 'providers', kind: 'provider', Icon: Route, shot: SHOTS.relay },
  { id: 'usage', kind: 'provider', Icon: BarChart3, shot: SHOTS.usage },
] as const

type ViewId = (typeof DEMO_VIEWS)[number]['id']

/** Real screenshots of the desktop app, one per tab of a dock under the window. */
export function ProductDemo() {
  const t = useTranslations('site.home.demo')
  const [view, setView] = useState<ViewId>('install')

  return (
    <Tabs.Root value={view} onValueChange={(v) => setView(v as ViewId)} activationMode="automatic">
      <WindowFrame title={t('window')} className="mx-auto max-w-[1040px]">
        {DEMO_VIEWS.map((v, i) => (
          <Tabs.Content key={v.id} value={v.id} tabIndex={-1} className="outline-none">
            <AppShot shot={v.shot} alt={t(`${v.id}.alt`)} sizes="(min-width: 1100px) 1020px, 100vw" priority={i === 0} />
          </Tabs.Content>
        ))}
      </WindowFrame>
      <Tabs.List aria-label={t('tabsLabel')} className="dock">
        {DEMO_VIEWS.map(({ id, kind, Icon }) => (
          <Tabs.Trigger key={id} value={id} data-kind={kind} aria-label={t(`${id}.name`)} title={t(`${id}.name`)}>
            <Icon size={24} aria-hidden />
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <p aria-live="polite" className="mx-auto mt-6 min-h-[3.3em] max-w-[46em] text-center text-fg-3">
        <b className="font-bold text-fg">{t(`${view}.name`)}</b>
        <span className="mx-2 text-line-strong" aria-hidden>
          ·
        </span>
        {t(`${view}.caption`)}
      </p>
    </Tabs.Root>
  )
}
