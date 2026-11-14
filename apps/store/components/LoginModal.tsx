'use client'

import * as Dialog from '@radix-ui/react-dialog'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import type { LoginProvider } from '@/lib/auth/providers'
import { BigLogo } from './BigLogo'

interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  providers?: LoginProvider[]
  /** Shown in place of the default line, e.g. after a sign-in that did not finish. */
  error?: string
}

function GithubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.8-.22 1.65-.33 2.5-.34.85.01 1.7.12 2.5.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.18.58.69.48A10.01 10.01 0 0022 12c0-5.52-4.48-10-10-10z" />
    </svg>
  )
}

// Google's brand colours are part of its mark, not theme colours.
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 010-4.2V7.06H2.18a11 11 0 000 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 00-9.82 6.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  )
}

export function LoginModal({ open, onOpenChange, providers = ['github'], error }: LoginModalProps) {
  const t = useTranslations('site.login')
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dlg-scrim" />
        <Dialog.Content className="dlg">
          <Dialog.Close aria-label={t('close')} className="dlg-x">
            <X size={18} aria-hidden />
          </Dialog.Close>
          <div className="grid justify-items-center gap-3 px-7 pb-[26px] pt-[30px] text-center">
            <BigLogo />
            <Dialog.Title className="text-[21px] font-extrabold leading-[1.35]">{t('title')}</Dialog.Title>
            <Dialog.Description className={error ? 'text-[15px] text-warn' : 'text-[15px] text-fg-2'} role={error ? 'alert' : undefined}>
              {error ?? t('body')}
            </Dialog.Description>
            <div className="mb-1 mt-2.5 grid w-full gap-2.5">
              {providers.includes('github') && (
                <a href="/auth/login?provider=github" className="btn btn-primary w-full">
                  <GithubMark />
                  {t('github')}
                </a>
              )}
              {providers.includes('google') && (
                <a href="/auth/login?provider=google" className="btn min-h-11 w-full">
                  <GoogleMark />
                  {t('google')}
                </a>
              )}
            </div>
            <p className="fine">
              {t.rich('consent', {
                terms: (chunks) => (
                  <Link href="/terms" onClick={() => onOpenChange(false)}>
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link href="/privacy" onClick={() => onOpenChange(false)}>
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
