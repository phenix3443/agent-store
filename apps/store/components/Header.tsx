'use client'

import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Suspense, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Search, X } from 'lucide-react'
import type { CurrentUser } from '@/lib/auth'
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n/config'
import { LoginModal } from './LoginModal'
import { SearchInput } from './SearchInput'

interface HeaderProps {
  user: CurrentUser | null
}

// The desktop app gets its own page in #160; until then its nav entry opens the download page.
const NAV = [
  { href: '/store', key: 'store' },
  { href: '/download', key: 'client' },
  { href: '/docs', key: 'docs' },
  { href: '/pricing', key: 'pricing' },
] as const

export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/" onClick={onClick} className="brand flex items-center gap-2.5 whitespace-nowrap text-base font-extrabold">
      <span aria-hidden className="logo">
        <i />
        <i />
        <i />
      </span>
      Agent Store
    </Link>
  )
}

function LanguageToggle({ className = '' }: { className?: string }) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('store.nav')
  const tl = useTranslations('store.lang')
  const next = SUPPORTED_LOCALES.find((code) => code !== locale) as SupportedLocale

  return (
    <button
      type="button"
      lang={next}
      aria-label={`${t('language')}：${tl(next)}`}
      onClick={() => {
        document.cookie = `locale=${next}; path=/; max-age=31536000`
        router.refresh()
      }}
      className={`grid h-9 min-w-9 place-items-center rounded-control px-2 text-[13.5px] font-semibold text-fg-2 transition-colors hover:bg-panel hover:text-fg ${className}`}
    >
      {next === 'en' ? 'EN' : tl(next)}
    </button>
  )
}

function AccountMenu({ user }: { user: CurrentUser }) {
  const t = useTranslations('store.nav')
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t('account')}
        className="grid h-9 w-9 place-items-center rounded-full bg-[image:var(--brand)] font-mono text-sm font-bold text-bg"
      >
        {user.initial}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={10} collisionPadding={8} className="menu">
          <div className="mb-1.5 border-b border-line px-3 pb-3 pt-2">
            <div className="truncate text-sm font-semibold">{user.username || user.email || 'you'}</div>
            {user.email && <div className="mt-0.5 truncate text-xs text-fg-3">{user.email}</div>}
          </div>
          <DropdownMenu.Item asChild className="menu-item">
            <Link href="/dashboard">{t('dashboard')}</Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="menu-separator" />
          <DropdownMenu.Item asChild className="menu-item text-bad">
            <a href="/auth/logout">{t('logout')}</a>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function MobileMenu({
  open,
  onOpenChange,
  user,
  onLogin,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: CurrentUser | null
  onLogin: () => void
}) {
  const pathname = usePathname()
  const t = useTranslations('store.nav')
  const close = () => onOpenChange(false)
  const row =
    'flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-[17px] font-semibold transition-colors hover:bg-panel-2 aria-[current=page]:bg-panel-2'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-2 top-2 z-50 flex max-h-[calc(100dvh-16px)] flex-col overflow-hidden rounded-[22px] border border-line-strong bg-pop shadow-sheet"
        >
          <Dialog.Title className="sr-only">{t('menu')}</Dialog.Title>
          <div className="flex items-center justify-between gap-3 border-b border-line py-3 pl-4 pr-3">
            <Brand onClick={close} />
            <Dialog.Close
              aria-label={t('close')}
              className="grid h-9 w-9 place-items-center rounded-control text-fg-2 hover:bg-panel-2 hover:text-fg"
            >
              <X size={18} aria-hidden />
            </Dialog.Close>
          </div>
          <div className="grid content-start gap-1.5 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
            <Suspense>
              {/* SearchInput is its own form; its submit bubbles here once it has navigated. */}
              <div onSubmit={close} className="mb-2">
                <SearchInput className="h-11" />
              </div>
            </Suspense>
            <nav aria-label={t('main')} className="grid gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={close}
                  aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
                  className={row}
                >
                  {t(item.key)}
                </Link>
              ))}
            </nav>
            <div className="mx-1 my-1.5 h-px bg-line" />
            {user ? (
              <>
                <Link href="/dashboard" onClick={close} className={row}>
                  {t('dashboard')}
                  <small className="min-w-0 truncate pl-3 text-[13px] font-normal text-fg-3">
                    {user.username || user.email}
                  </small>
                </Link>
                <a href="/auth/logout" className={`${row} text-bad`}>
                  {t('logout')}
                </a>
              </>
            ) : (
              <button
                type="button"
                className={row}
                onClick={() => {
                  close()
                  onLogin()
                }}
              >
                {t('login')}
              </button>
            )}
            <div className="flex min-h-12 items-center justify-between px-3 text-[15px] font-medium">
              {t('language')}
              <LanguageToggle />
            </div>
            <Link href="/download" onClick={close} className="btn btn-primary mt-3 w-full">
              {t('downloadLong')}
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname()
  const t = useTranslations('store.nav')
  const [loginOpen, setLoginOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <header className="sticky top-3 z-30 mx-auto mt-3 h-[58px] w-[min(1080px,calc(100%-24px))]">
        <div className="flex h-full items-center gap-1.5 rounded-card border border-line bg-nav pl-4 pr-2.5 shadow-nav backdrop-blur-[20px] backdrop-saturate-150 lg:grid lg:grid-cols-[1fr_auto_1fr]">
          <div className="flex min-w-0 items-center">
            <Brand />
          </div>

          <nav aria-label={t('main')} className="hidden items-center gap-0.5 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
                className="nav-link"
              >
                {t(item.key)}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center justify-end gap-2">
            <Suspense>
              <SearchInput className="hidden w-40 lg:flex xl:w-52" />
            </Suspense>
            <LanguageToggle className="hidden lg:grid" />
            {user ? (
              <span className="hidden lg:block">
                <AccountMenu user={user} />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="hidden px-1.5 py-2 text-[14.5px] font-medium text-fg-2 transition-colors hover:text-fg lg:block"
              >
                {t('login')}
              </button>
            )}
            <Link href="/download" className="btn btn-primary btn-sm">
              {t('download')}
            </Link>
            <button
              type="button"
              aria-label={t('search')}
              onClick={() => setMenuOpen(true)}
              className="grid h-[38px] w-[38px] place-items-center rounded-control border border-line text-fg-2 transition-colors hover:border-line-strong hover:text-fg lg:hidden"
            >
              <Search size={17} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t('menu')}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className="grid h-[38px] w-[38px] place-items-center rounded-control border border-line lg:hidden"
            >
              <span aria-hidden className="relative block h-0.5 w-4 -translate-y-[2.5px] rounded-sm bg-fg before:absolute before:left-0 before:top-[5px] before:h-0.5 before:w-4 before:rounded-sm before:bg-fg before:content-['']" />
            </button>
          </div>
        </div>
      </header>

      <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} user={user} onLogin={() => setLoginOpen(true)} />
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  )
}
