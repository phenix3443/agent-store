'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Box } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { LangSwitcher } from './LangSwitcher'

export function Header() {
  const pathname = usePathname()
  const t = useTranslations('store.nav')

  return (
    <header className="flex h-16 items-center justify-between border-b border-store-border">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-store-accent text-white">
          <Box size={18} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-store-text">Agent Store</p>
          <p className="font-mono text-[10px] text-store-text-3">registry for AI agents</p>
        </div>
      </div>

      <nav className="flex items-center gap-6 text-sm text-store-text-2">
        <Link href="/store" className="hover:text-store-text">{t('explore')}</Link>
        <Link href="/docs" className="hover:text-store-text">{t('docs')}</Link>
      </nav>

      <div className="flex items-center gap-3">
        <Link
          href={`${pathname}?publish=1`}
          className="flex items-center gap-1 rounded-lg bg-store-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={16} />
          {t('publish')}
        </Link>
        <ThemeToggle />
        <LangSwitcher />
        <Link
          href="/publisher/me"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-store-accent to-store-green text-sm font-semibold text-white"
        >
          Y
        </Link>
      </div>
    </header>
  )
}
