'use client'

import * as Tabs from '@radix-ui/react-tabs'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

export type MapCategory = 'skill' | 'mcp' | 'provider'

export interface MapSample {
  name: string
  slug: string
  /** Tools the package declares (`compatibleWith`); only those get a row. */
  tools: ('claude' | 'codex')[]
}

interface Write {
  /** Which side reads it: a tool, or Agent Store's own files under ~/.agent-store. */
  owner: 'claude' | 'codex' | 'store'
  file: string
  /** The key or table inside the file; absent when the entry is the file or directory itself. */
  entry?: string
  note: string
}

// Paths and keys as apps/client-core writes them (adapters/, config/, skills/).
// `{slug}` is replaced with the sample package; `<name>` stays literal.
const WRITES: Record<MapCategory, Write[]> = {
  skill: [
    { owner: 'claude', file: '~/.claude/skills/<name>', note: 'skill.claude' },
    { owner: 'codex', file: '~/.codex/skills/<name>', note: 'skill.codex' },
    { owner: 'store', file: '~/.agent-store/skills/{slug}/', entry: '.agent-store.json', note: 'skill.store' },
  ],
  mcp: [
    { owner: 'claude', file: '~/.claude.json', entry: 'mcpServers.{slug}', note: 'mcp.claude' },
    { owner: 'codex', file: '~/.codex/config.toml', entry: '[mcp_servers.{slug}]', note: 'mcp.codex' },
    { owner: 'store', file: '~/.agent-store/mcps/{slug}/', entry: 'targets.json', note: 'mcp.store' },
  ],
  provider: [
    {
      owner: 'claude',
      file: '~/.claude/settings.json',
      entry: 'env.ANTHROPIC_BASE_URL = "http://127.0.0.1:18780"\nenv.ANTHROPIC_AUTH_TOKEN = <relay token>',
      note: 'provider.claude',
    },
    {
      owner: 'codex',
      file: '~/.codex/config.toml',
      entry: 'model_provider = "aas-relay"\n[model_providers.aas-relay]\nbase_url = "http://127.0.0.1:18780"',
      note: 'provider.codex',
    },
    { owner: 'store', file: '~/.agent-store/providers/{slug}/', entry: 'config.json  (0600)', note: 'provider.store' },
  ],
}

const CATEGORIES: MapCategory[] = ['skill', 'mcp', 'provider']
const OWNER_NAME = { claude: 'Claude Code', codex: 'Codex', store: 'Agent Store' } as const

function fill(text: string, slug: string) {
  return text.replaceAll('{slug}', slug)
}

export function InstallMap({ samples }: { samples: Record<MapCategory, MapSample | null> }) {
  const t = useTranslations('site.home.map')

  return (
    <Tabs.Root defaultValue="skill" className="mt-10">
      <Tabs.List aria-label={t('tabsLabel')} className="flex gap-6 border-b border-line">
        {CATEGORIES.map((c) => (
          <Tabs.Trigger
            key={c}
            value={c}
            className="-mb-px border-b-2 border-transparent px-1 pb-3 text-[15px] text-ink-2 transition-colors hover:text-ink focus-visible:outline-offset-[-2px] data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink"
          >
            {t(`tabs.${c}`)}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {CATEGORIES.map((c) => {
        const sample = samples[c]
        const slug = sample?.slug ?? '<slug>'
        const writes = WRITES[c].filter((w) => w.owner === 'store' || !sample || sample.tools.includes(w.owner))
        const missing = sample ? (['claude', 'codex'] as const).filter((tool) => !sample.tools.includes(tool)) : []
        return (
          <Tabs.Content key={c} value={c} className="grid gap-6 pt-8 focus-visible:outline-offset-4 lg:grid-cols-[minmax(0,17rem)_auto_minmax(0,1fr)] lg:items-start lg:gap-8">
            <div className="border border-ink bg-plate px-5 py-4">
              <p className="label">{t('package')}</p>
              <p className="mt-2 break-words text-[22px] leading-7">{sample?.name ?? t('placeholder')}</p>
              <p className="mt-1 break-words font-mono text-[13px] text-ink-2">{slug}</p>
            </div>

            <div className="flex items-center gap-3 lg:flex-col lg:pt-6">
              <code className="break-words border border-line bg-paper px-3 py-2 font-mono text-[13px]">
                <span className="text-ink-2">$ </span>aas install {slug}
              </code>
              <ArrowRight size={18} aria-hidden className="hidden text-ink-2 lg:block" />
              <ArrowDown size={18} aria-hidden className="text-ink-2 lg:hidden" />
            </div>

            <ul className="border-t border-ink">
              {writes.map((w) => (
                <li key={w.owner} className="grid gap-x-6 gap-y-1 border-b border-line py-4 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
                  <p className="text-[15px] font-medium">{OWNER_NAME[w.owner]}</p>
                  <div className="min-w-0">
                    <p className="break-words font-mono text-[13px] leading-5">{fill(w.file, slug)}</p>
                    {w.entry && (
                      <pre className="mt-1 whitespace-pre-wrap break-words bg-fill px-2 py-1 font-mono text-[13px] leading-5">
                        {fill(w.entry, slug)}
                      </pre>
                    )}
                    <p className="mt-2 text-sm leading-[22px] text-ink-2">{t(w.note)}</p>
                  </div>
                </li>
              ))}
              {missing.map((tool) => (
                <li key={tool} className="grid gap-x-6 gap-y-1 border-b border-line py-4 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
                  <p className="text-[15px] font-medium text-ink-2">{OWNER_NAME[tool]}</p>
                  <p className="text-sm leading-[22px] text-ink-2">{t('unsupported', { tool: OWNER_NAME[tool] })}</p>
                </li>
              ))}
            </ul>
          </Tabs.Content>
        )
      })}
    </Tabs.Root>
  )
}
