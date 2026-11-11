'use client'

import * as Dialog from '@radix-ui/react-dialog'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { PlateMarks } from './PlateMarks'

interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const t = useTranslations('site.login')
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <Dialog.Content className="plate fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 border border-ink bg-plate px-6 pb-6 pt-6 sm:px-8 sm:pt-8">
          <PlateMarks />
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-[28px] leading-[1.1] tracking-[-0.02em]">{t('title')}</Dialog.Title>
            <Dialog.Close aria-label={t('close')} className="-mr-2 -mt-1 grid h-8 w-8 shrink-0 place-items-center hover:bg-sel">
              <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
                <path d="m1.5 1.5 10 10M11.5 1.5l-10 10" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-3 text-sm leading-[22px] text-ink-2">{t('body')}</Dialog.Description>

          <div className="mt-7 flex flex-col gap-2.5">
            <a href="/auth/login?provider=github" className="btn btn-primary w-full gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.8-.22 1.65-.33 2.5-.34.85.01 1.7.12 2.5.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.18.58.69.48A10.01 10.01 0 0022 12c0-5.52-4.48-10-10-10z" />
              </svg>
              {t('github')}
            </a>
            <a href="/auth/login?provider=google" className="btn min-h-12 w-full gap-3">
              <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z" />
                <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 010-4.2V7.06H2.18a11 11 0 000 9.88l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 00-9.82 6.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
              </svg>
              {t('google')}
            </a>
          </div>

          <p className="mt-6 border-t border-line pt-4 text-[13px] leading-5 text-ink-2">
            {t.rich('consent', {
              terms: (chunks) => (
                <Link href="/terms" onClick={() => onOpenChange(false)} className="link text-ink">
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link href="/privacy" onClick={() => onOpenChange(false)} className="link text-ink">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
