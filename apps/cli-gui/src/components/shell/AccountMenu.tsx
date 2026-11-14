import { Github, LogOut, Settings, User, Zap } from 'lucide-react'
import { useAppState } from '../../state/AppState'
import { useAuth } from '../../state/Auth'
import { useEntitlement } from '../../state/Entitlement'
import { useT } from '../../i18n'
import { useAccountActions } from '../../lib/useAccountActions'
import { useNavigate } from '../../lib/useNavigate'
import { toast } from '../ui/toast'
import { cn } from '../ui/cn'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/menu'

export function AccountMenu({ narrow }: { narrow: boolean }) {
  const t = useT()
  const { email, signedIn, configured } = useAuth()
  const { entitlements } = useEntitlement()
  const { setSettingsTab } = useAppState()
  const navigate = useNavigate()
  const account = useAccountActions()
  const isPro = entitlements.plan !== 'free'
  const who = signedIn ? email ?? t('settings.account.signedIn') : t('account.out')
  const plan = isPro ? 'Pro' : 'Free'

  function openAccountSettings() {
    setSettingsTab('account')
    navigate('settings')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${t('account.menu')}: ${who}`}
          title={narrow ? who : undefined}
          className={cn(
            'flex h-[42px] w-full items-center gap-2.5 rounded-ctl px-2 text-left hover:bg-panel data-[state=open]:bg-panel',
            narrow && 'justify-center px-0'
          )}
        >
          <span
            className={cn(
              'grid h-[26px] w-[26px] flex-none place-items-center rounded-full text-xs font-bold',
              signedIn ? 'bg-[image:var(--brand)] text-canvas' : 'border border-line-strong bg-panel-2 text-fg-2'
            )}
          >
            {signedIn ? (email ?? 'A').charAt(0).toUpperCase() : <User size={14} />}
          </span>
          <span className="min-w-0 flex-1 leading-tight max-[1040px]:hidden">
            <b className="block truncate text-[12.5px] font-semibold">{who}</b>
            <small className="text-[11px] text-fg-3">{signedIn ? plan : t('account.outSub')}</small>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        {signedIn ? (
          <>
            <DropdownMenuLabel>
              <b className="block text-[13px] text-fg">{email}</b>
              {isPro ? t('account.planPro') : t('account.planFree')}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {!isPro && (
              <DropdownMenuItem disabled={account.busy} onSelect={() => void account.upgrade()}>
                <Zap />
                {t('account.upgrade')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={openAccountSettings}>
              <User />
              {t('account.settings')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!configured || account.busy}
              onSelect={() => void account.signOut().then((ok) => ok && toast(t('account.signedOut')))}
            >
              <LogOut />
              {t('account.signout')}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuLabel className="max-w-[260px]">{t('account.outHint')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!configured || account.busy} onSelect={() => void account.signIn('github')}>
              <Github />
              {t('settings.account.signInGithub')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!configured || account.busy} onSelect={() => void account.signIn('google')}>
              <User />
              {t('settings.account.signInGoogle')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={openAccountSettings}>
              <Settings />
              {t('account.settings')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
