'use client'

import { useState } from 'react'
import * as Switch from '@radix-ui/react-switch'
import { useTranslations } from 'next-intl'

// Where the desktop app keeps a skill and where each agent reads it (client-core adapters/skill.ts).
export const SKILL_TARGETS = [
  { id: 'claude', name: 'Claude Code', path: '~/.claude/skills/tdd' },
  { id: 'codex', name: 'Codex', path: '~/.codex/skills/tdd' },
] as const
export const SKILL_LIBRARY = '~/.agent-store/skills/tdd/'

type Target = (typeof SKILL_TARGETS)[number]['id']

/** One skill in the library, one link per agent; the switches add or remove a link. */
export function SkillLinks() {
  const t = useTranslations('site.client.library')
  const [on, setOn] = useState<Record<Target, boolean>>({ claude: true, codex: false })

  return (
    <div className="grid gap-3.5 p-5">
      {SKILL_TARGETS.map((x, i) => (
        <div key={x.id} data-on={on[x.id]} className="link-row">
          <div className="link-node link-node-src">
            {SKILL_LIBRARY}
            <small>{i ? t('sameSource') : t('source')}</small>
          </div>
          <div aria-hidden className="link-wire" />
          <div className="link-node">
            {x.path}
            <small>{t('reads', { tool: x.name })}</small>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-[18px] border-t border-line pt-3.5">
        {SKILL_TARGETS.map((x) => (
          <label key={x.id} className="flex items-center gap-2 text-[13px] text-fg-2">
            <Switch.Root
              checked={on[x.id]}
              onCheckedChange={(v) => setOn((s) => ({ ...s, [x.id]: v }))}
              className="switch"
            >
              <Switch.Thumb asChild>
                <span />
              </Switch.Thumb>
            </Switch.Root>
            {t('enable', { tool: x.name })}
          </label>
        ))}
      </div>
    </div>
  )
}
