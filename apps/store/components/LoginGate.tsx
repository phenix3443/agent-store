'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { LoginProvider } from '@/lib/auth/providers'
import { BigLogo } from './BigLogo'
import { LoginModal } from './LoginModal'

export function LoginGate({ providers }: { providers: LoginProvider[] }) {
  const t = useTranslations('site.dashboard')
  const tn = useTranslations('store.nav')
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(true), [])

  return (
    <div className="gate">
      <BigLogo />
      <h1 className="h2">{t('gateTitle')}</h1>
      <p className="text-fg-2">{t('gateBody')}</p>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
        {tn('login')}
      </button>
      <Link href="/" className="link text-fg-2">
        {t('home')}
      </Link>
      <LoginModal open={open} onOpenChange={setOpen} providers={providers} />
    </div>
  )
}
