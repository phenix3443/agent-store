import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Brand } from './Header'

const SOURCE_URL = 'https://github.com/phenix3443/agent-store'

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
        { href: '/docs#cli', label: t('cli') },
        { href: `${SOURCE_URL}/releases`, label: t('releases') },
        { href: SOURCE_URL, label: t('source') },
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
    <footer className="store-shell relative mt-24 overflow-hidden border-t border-line lg:mt-32">
      <div className="mx-auto w-[min(1160px,calc(100%-2*clamp(16px,4vw,32px)))]">
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 pb-10 pt-16 md:grid-cols-[1.5fr_repeat(3,1fr)] md:gap-10">
          <div className="col-span-full md:col-span-1">
            <Brand />
            <p className="mt-3.5 max-w-[34ch] text-sm text-fg-2">{t('tagline')}</p>
          </div>
          {groups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="mb-3.5 text-[12.5px] font-semibold text-fg-3">{group.title}</h2>
              <ul className="space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith('http') ? (
                      <a href={link.href} className="text-sm text-fg-2 transition-colors hover:text-fg">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="text-sm text-fg-2 transition-colors hover:text-fg">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-4 border-t border-line pb-7 pt-5 text-[12.5px] text-fg-3">
          <span>{t('copyright')}</span>
          <span>{t('supported')}</span>
        </div>
      </div>
      <div aria-hidden lang="en" className="footer-word">
        Agent Store
      </div>
    </footer>
  )
}
