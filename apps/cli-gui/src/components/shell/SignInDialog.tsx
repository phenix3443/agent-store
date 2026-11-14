import { useEffect, useRef } from 'react'
import { useAuth, type AuthProviderName } from '../../state/Auth'
import { useFavorites } from '../../state/Favorites'
import { useT } from '../../i18n'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../ui/dialog'
import { Banner, Spinner } from '../ui/states'
import { toast } from '../ui/toast'

const PROVIDER_NAMES: Record<AuthProviderName, string> = { github: 'GitHub', google: 'Google' }

/** XXXX-XXXX, the way the store's approval page prints it. */
export function formatUserCode(code: string): string {
  const c = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

/** The wait for the browser, plus the toasts for how a sign-in ended and for refused favorites. */
export function SignInDialog() {
  const t = useT()
  const { pending, signIn, reopenSignIn, cancelSignIn, signedIn, email, notice } = useAuth()
  const { refusedFull, clearRefused } = useFavorites()
  const waited = useRef(false)

  useEffect(() => {
    if (pending) {
      waited.current = true
      return
    }
    if (waited.current && signedIn) toast(email ? t('auth.signedIn').replace('{0}', email) : t('auth.signedInNoEmail'))
    waited.current = false
  }, [pending, signedIn, email, t])

  useEffect(() => {
    if (notice === 'expired') toast.error(t('auth.expiredT'), { description: t('auth.expiredD') })
    else if (notice === 'notSaved') toast(t('auth.notSavedT'), { description: t('auth.notSavedD'), duration: 12_000 })
    // A language switch must not repeat the toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice])

  useEffect(() => {
    if (!refusedFull) return
    toast.error(t('fav.full'))
    clearRefused()
  }, [refusedFull, clearRefused, t])

  const provider = pending ? PROVIDER_NAMES[pending.provider] : ''
  const minutes = pending?.expiresAt ? Math.max(1, Math.round((pending.expiresAt - Date.now()) / 60_000)) : null
  const ended = pending && pending.state !== 'starting' && pending.state !== 'waiting' ? pending : null

  return (
    <Dialog open={pending != null} onOpenChange={(open) => !open && cancelSignIn()}>
      <DialogContent aria-describedby={undefined}>
        <DialogBody>
          <DialogTitle>{t('auth.title')}</DialogTitle>
          {pending?.state === 'starting' && (
            <div className="grid justify-items-center gap-2.5 py-5 text-center">
              <Spinner className="h-7 w-7 border-[3px]" />
              <p className="text-[13px] text-fg-2">{t('auth.starting')}</p>
            </div>
          )}
          {pending?.state === 'waiting' && (
            <div className="grid justify-items-center gap-2.5 pb-1.5 pt-4 text-center">
              <Spinner className="h-7 w-7 border-[3px]" />
              <h2 className="text-[15px] font-bold">{t('auth.waitT')}</h2>
              <DialogDescription className="mb-0 max-w-[40ch]">{t('auth.waitD').replace('{0}', provider)}</DialogDescription>
              {pending.userCode && (
                <div className="mt-1 grid justify-items-center gap-1">
                  <span className="text-[11.5px] text-fg-3">{t('auth.code')}</span>
                  <code data-testid="user-code" className="rounded-ctl border border-line-strong bg-panel px-4 py-2 font-mono text-[22px] font-bold tracking-[0.14em] text-fg">
                    {formatUserCode(pending.userCode)}
                  </code>
                  {minutes != null && <span className="text-[11.5px] text-fg-3">{t('auth.valid').replace('{0}', String(minutes))}</span>}
                </div>
              )}
            </div>
          )}
          {ended && (
            <div className="mt-2">
              <Banner tone={ended.state === 'failed' ? 'error' : 'warn'} title={t(`auth.${ended.state}T`)}>
                <p>{t(`auth.${ended.state}D`)}</p>
              </Banner>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {ended ? (
            <>
              <Button onClick={cancelSignIn}>{t('auth.close')}</Button>
              <Button variant="primary" autoFocus onClick={() => void signIn(ended.provider)}>
                {t('auth.retry')}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={cancelSignIn}>{t('auth.cancel')}</Button>
              <Button autoFocus disabled={pending?.state !== 'waiting'} onClick={() => void reopenSignIn()}>
                {t('auth.reopen')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
