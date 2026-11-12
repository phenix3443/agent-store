import { useTranslations } from 'next-intl'

const SOURCES = [
  { key: 'mcp', href: 'https://registry.modelcontextprotocol.io' },
  { key: 'skill', href: null },
  { key: 'provider', href: null },
] as const

// What each tool reads, as apps/client-core resolves it (paths.ts, adapters/).
const TOOLS = [
  {
    key: 'claude',
    name: 'Claude Code',
    paths: ['~/.claude/skills/', '~/.claude.json', '~/.claude/settings.json'],
  },
  {
    key: 'codex',
    name: 'Codex',
    paths: ['~/.agents/skills/', '~/.codex/config.toml'],
  },
] as const

export function Sources() {
  const t = useTranslations('site.home.sources')

  return (
    <div className="mt-10 grid gap-x-16 gap-y-12 lg:grid-cols-2">
      <div className="min-w-0">
        <h3 className="label">{t('catalogLabel')}</h3>
        <dl className="mt-3 border-t border-ink">
          {SOURCES.map((s) => (
            <div key={s.key} className="border-b border-line py-4">
              <dt className="text-[17px] leading-[26px]">
                {s.href ? (
                  <a href={s.href} className="link">
                    {t(`${s.key}.name`)}
                  </a>
                ) : (
                  t(`${s.key}.name`)
                )}
              </dt>
              <dd className="mt-1 text-sm leading-[22px] text-ink-2">{t(`${s.key}.body`)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-[56ch] text-sm leading-[22px] text-ink-2">{t('sync')}</p>
      </div>

      <div className="min-w-0">
        <h3 className="label">{t('toolsLabel')}</h3>
        <dl className="mt-3 border-t border-ink">
          {TOOLS.map((tool) => (
            <div key={tool.key} className="grid gap-x-6 gap-y-2 border-b border-line py-4 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
              <dt className="text-[17px] leading-[26px]">{tool.name}</dt>
              <dd className="min-w-0">
                <ul className="space-y-1">
                  {tool.paths.map((p) => (
                    <li key={p} className="break-words font-mono text-[13px] leading-5">
                      {p}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm leading-[22px] text-ink-2">{t(`${tool.key}Note`)}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
