import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

const SOURCE_URL = 'https://github.com/awesome-agent-store/agent-store'

export async function SiteFooter() {
  const t = await getTranslations('site.footer')

  const groups = [
    {
      title: t('product'),
      links: [
        { href: '/store', label: t('store') },
        { href: '/pricing', label: t('pricing') },
        { href: '/download', label: t('download') },
      ],
    },
    {
      title: t('resources'),
      links: [
        { href: '/docs', label: t('docs') },
        { href: SOURCE_URL, label: t('source') },
        { href: `${SOURCE_URL}/releases`, label: t('releases') },
      ],
    },
    {
      title: t('legal'),
      links: [
        { href: '/privacy', label: t('privacy') },
        { href: '/terms', label: t('terms') },
      ],
    },
  ]

  return (
    <footer className="store-shell border-t border-ink px-4 lg:px-10">
      <div className="grid gap-x-10 gap-y-8 py-10 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-semibold tracking-[-0.01em]">
            <span aria-hidden className="h-3.5 w-3.5 rounded-full bg-ink" />
            Agent Store
          </Link>
          <p className="mt-3 max-w-[40ch] text-sm leading-[22px] text-ink-2">{t('tagline')}</p>
          <p className="mt-6 font-mono text-xs text-ink-2">{t('copyright')}</p>
        </div>
        <nav aria-label={t('label')} className="grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title}>
              <h2 className="label">{group.title}</h2>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith('http') ? (
                      <a href={link.href} className="text-sm hover:underline hover:underline-offset-[3px]">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="text-sm hover:underline hover:underline-offset-[3px]">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  )
}
