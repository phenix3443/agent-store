'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Suspense, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { Check, Menu, Settings } from 'lucide-react'
import type { CurrentUser } from '@/lib/auth'
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n/config'
import { LoginModal } from './LoginModal'
import { SearchInput } from './SearchInput'

interface HeaderProps {
  user: CurrentUser | null
}

const NAV = [
  { href: '/store', key: 'store' },
  { href: '/docs', key: 'docs' },
  { href: '/pricing', key: 'pricing' },
] as const

const THEMES = [
  { value: 'light', key: 'themeLight' },
  { value: 'dark', key: 'themeDark' },
  { value: 'system', key: 'themeSystem' },
] as const

function RadioItem({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <DropdownMenu.RadioItem value={value} className="menu-item">
      <span className="grid w-4 place-items-center">
        <DropdownMenu.ItemIndicator>
          <Check size={14} aria-hidden />
        </DropdownMenu.ItemIndicator>
      </span>
      {children}
    </DropdownMenu.RadioItem>
  )
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('store.nav')
  const tl = useTranslations('store.lang')
  const { theme, setTheme } = useTheme()
  const [loginOpen, setLoginOpen] = useState(false)

  const isStore = pathname.startsWith('/store')

  function selectLocale(next: string) {
    document.cookie = `locale=${next as SupportedLocale}; path=/; max-age=31536000`
    router.refresh()
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 border-b border-line bg-paper px-4 lg:h-[72px] lg:flex-nowrap lg:px-10">
        <Link href="/" className="flex h-14 items-center gap-2.5 text-lg font-semibold tracking-[-0.01em] lg:h-full">
          <span aria-hidden className="h-3.5 w-3.5 rounded-full bg-ink" />
          Agent Store
        </Link>

        <nav
          aria-label={t('main')}
          className="hidden h-14 gap-7 md:ml-8 md:flex lg:ml-0 lg:h-[72px] lg:flex-1 lg:justify-center lg:gap-5 xl:gap-9"
        >
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="-mb-px flex items-center whitespace-nowrap border-b-2 border-transparent text-[15px] text-ink-2 transition-colors hover:text-ink aria-[current=page]:border-ink aria-[current=page]:font-medium aria-[current=page]:text-ink"
              >
                {t(item.key)}
              </Link>
            )
          })}
        </nav>

        <span className="flex-1 lg:hidden" />

        <Suspense>
          <SearchInput className="order-last mb-3 w-full lg:order-none lg:mb-0 lg:w-44 xl:w-72" />
        </Suspense>

        {isStore && (
          <Link href="/store?publish=1" className="btn hidden h-9 px-4 md:inline-flex">
            {t('publish')}
          </Link>
        )}

        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label={t('menu')}
            className="grid h-9 w-9 place-items-center border border-line text-ink transition-colors hover:border-ink data-[state=open]:border-ink data-[state=open]:bg-sel"
          >
            <Menu size={18} aria-hidden className="md:hidden" />
            <Settings size={17} aria-hidden className="hidden md:block" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={8} collisionPadding={8} className="menu">
              <div className="md:hidden">
                {NAV.map((item) => (
                  <DropdownMenu.Item key={item.href} asChild className="menu-item">
                    <Link
                      href={item.href}
                      aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
                      className="group menu-item aria-[current=page]:font-medium"
                    >
                      <span className="grid w-4 place-items-center">
                        <span className="hidden h-1.5 w-1.5 rounded-full bg-ink group-aria-[current=page]:block" />
                      </span>
                      {t(item.key)}
                    </Link>
                  </DropdownMenu.Item>
                ))}
                {isStore && (
                  <DropdownMenu.Item asChild className="menu-item">
                    <Link href="/store?publish=1">
                      <span className="w-4" />
                      {t('publish')}
                    </Link>
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator className="menu-separator" />
              </div>
              <DropdownMenu.Label className="label menu-label">{t('theme')}</DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
                {THEMES.map((option) => (
                  <RadioItem key={option.value} value={option.value}>
                    {t(option.key)}
                  </RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator className="menu-separator" />
              <DropdownMenu.Label className="label menu-label">{t('language')}</DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={locale} onValueChange={selectLocale}>
                {SUPPORTED_LOCALES.map((code) => (
                  <RadioItem key={code} value={code}>
                    <span lang={code}>{tl(code)}</span>
                  </RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {user ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              aria-label={t('account')}
              className="grid h-9 w-9 place-items-center bg-ink font-mono text-sm font-medium text-on-ink"
            >
              {user.initial}
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={8} collisionPadding={8} className="menu">
                <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
                  <div className="truncate font-mono text-sm font-medium">{user.username || user.email || 'you'}</div>
                  {user.email && <div className="mt-0.5 truncate text-xs text-ink-2">{user.email}</div>}
                </div>
                <DropdownMenu.Item asChild className="menu-item mt-1.5">
                  <Link href={user.username ? `/publisher/${user.username}` : '/dashboard'}>{t('myHome')}</Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild className="menu-item">
                  <Link href="/dashboard">{t('settings')}</Link>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="menu-separator" />
                <DropdownMenu.Item asChild className="menu-item text-danger">
                  <a href="/auth/logout">{t('logout')}</a>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : (
          <button type="button" onClick={() => setLoginOpen(true)} className="btn h-9 px-4">
            {t('login')}
          </button>
        )}
      </header>

      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  )
}
