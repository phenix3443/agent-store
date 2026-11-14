'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { StoreClient } from '@as/sdk'
import { getAuthToken } from '@/lib/auth/token'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

type Action = 'cancel' | 'resume' | 'portal'

function useBillingAction() {
  const t = useTranslations('site.dashboard')
  const router = useRouter()
  const [busy, setBusy] = useState<Action | null>(null)
  const [failed, setFailed] = useState<Action | null>(null)
  const [done, setDone] = useState<'cancel' | 'resume' | null>(null)

  async function run(action: Action): Promise<boolean> {
    if (busy) return false
    setBusy(action)
    setFailed(null)
    setDone(null)
    try {
      const token = await getAuthToken()
      if (!token) throw new Error('signed out')
      const client = new StoreClient(API_URL)
      if (action === 'portal') {
        const result = await client.openBillingPortal(token)
        if (!result.data) throw new Error(result.error)
        window.location.assign(result.data.portalUrl)
        return true
      }
      const result = await (action === 'cancel' ? client.cancelSubscription(token) : client.resumeSubscription(token))
      if (!result.data) throw new Error(result.error)
      setDone(action)
      router.refresh()
      return true
    } catch {
      setFailed(action)
      return false
    } finally {
      setBusy(null)
    }
  }

  const message = failed ? (
    <p role="alert" className="mt-3 text-sm text-bad">
      {t(`failed.${failed}`)}
    </p>
  ) : (
    <p role="status" className={done ? 'mt-3 text-sm text-fg-2' : undefined}>
      {done ? t(`done.${done}`) : null}
    </p>
  )

  return { t, busy, run, message }
}

/** Cancel (behind a confirmation) or resume, on the plan card. */
export function SubscriptionActions({ mode, endDate }: { mode: 'cancel' | 'resume'; endDate: string | null }) {
  const { t, busy, run, message } = useBillingAction()
  const [open, setOpen] = useState(false)
  const keep = useRef<HTMLButtonElement>(null)

  if (mode === 'resume') {
    return (
      <div>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy != null} onClick={() => run('resume')}>
          {busy === 'resume' ? t('working.resume') : t('resume')}
        </button>
        {message}
      </div>
    )
  }

  return (
    <div>
      <Dialog.Root open={open} onOpenChange={(next) => busy == null && setOpen(next)}>
        <Dialog.Trigger asChild>
          <button type="button" className="btn btn-sm text-bad" data-subscription-cancel>
            {t('cancel')}
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="dlg-scrim" />
          <Dialog.Content
            role="alertdialog"
            className="dlg"
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              keep.current?.focus()
            }}
          >
            <Dialog.Close aria-label={t('confirm.close')} className="dlg-x" disabled={busy != null}>
              <X size={18} aria-hidden />
            </Dialog.Close>
            <div className="grid gap-3 px-7 pb-[26px] pt-[30px]">
              <Dialog.Title className="pr-8 text-[21px] font-extrabold leading-[1.35]">{t('confirm.title')}</Dialog.Title>
              <Dialog.Description asChild>
                <div className="grid gap-2 text-[15px] text-fg-2">
                  <p>{endDate ? t('confirm.happens', { date: endDate }) : t('confirm.happensUndated')}</p>
                  <p>{t('confirm.notHappens')}</p>
                </div>
              </Dialog.Description>
              {message}
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <Dialog.Close asChild>
                  <button ref={keep} type="button" className="btn btn-primary" disabled={busy != null}>
                    {t('confirm.keep')}
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  className="btn min-h-11 text-bad"
                  disabled={busy != null}
                  onClick={async () => {
                    if (await run('cancel')) setOpen(false)
                  }}
                >
                  {busy === 'cancel' ? t('working.cancel') : t('confirm.confirm')}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {!open && message}
    </div>
  )
}

/** Opens the store's Waffo customer portal: orders, subscription and payments. */
export function BillingPortalButton() {
  const { t, busy, run, message } = useBillingAction()
  return (
    <div className="mt-4">
      <button type="button" className="btn btn-sm" disabled={busy != null} onClick={() => run('portal')}>
        {busy === 'portal' ? t('working.portal') : t('portal')}
      </button>
      {message}
    </div>
  )
}
