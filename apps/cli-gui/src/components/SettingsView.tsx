import { useState, type ReactNode } from 'react'
import { ChevronDown, Github } from 'lucide-react'
import { useAppState, type AgentApp, type SettingsTab } from '../state/AppState'
import { useAuth } from '../state/Auth'
import { useEntitlement } from '../state/Entitlement'
import { useI18n, LOCALES, LOCALE_NAMES, type Locale } from '../i18n'
import { callRpc } from '../lib/rpc'
import { openExternal } from '../lib/openExternal'
import { useAccountActions } from '../lib/useAccountActions'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Banner } from './ui/states'
import { Logo } from './ui/icons'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './ui/menu'
import { version as appVersion } from '../../src-tauri/tauri.conf.json'

// Google's brand mark (lucide has no Google icon).
function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 010-4.2V7.06H2.18a11 11 0 000 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 00-9.82 6.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  )
}

const APP_META: Record<AgentApp, { label: string; path: string }> = {
  claude: { label: 'Claude Code', path: '~/.claude' },
  codex: { label: 'Codex', path: '~/.codex' },
}

function Row({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-[54px] items-center gap-3 border-b border-line px-3.5 py-[11px] last:border-b-0">
      <div className="min-w-0 flex-1">
        <b className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">{title}</b>
        {sub && <small className="block text-xs text-fg-3">{sub}</small>}
      </div>
      {children}
    </div>
  )
}

function Group({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-col overflow-hidden rounded-box border border-line">{children}</div>
}

export function SettingsView() {
  const { agentApp, settingsTab, setSettingsTab } = useAppState()
  const { email, signedIn, configured } = useAuth()
  const { entitlements } = useEntitlement()
  const { locale, setLocale, t } = useI18n()
  const account = useAccountActions()
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)
  const isPro = entitlements.plan !== 'free'

  const TABS: { key: SettingsTab; label: string }[] = [
    { key: 'general', label: t('settings.tabs.general') },
    { key: 'account', label: t('settings.tabs.account') },
    { key: 'about', label: t('settings.tabs.about') },
  ]

  async function checkForUpdates() {
    setUpdateMsg(t('settings.about.checking'))
    try {
      const updates = await callRpc<unknown[]>('checkUpdates')
      setUpdateMsg(updates.length > 0 ? `${updates.length} ${t('settings.about.updatesSuffix')}` : t('settings.about.upToDate'))
    } catch {
      setUpdateMsg(t('settings.about.checkFailed'))
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-6 pt-[18px] max-[1040px]:px-4">
      <div className="mb-3.5 flex flex-wrap items-end gap-3">
        <h1 className="text-[19px] font-extrabold leading-[1.3]">{t('settings.title')}</h1>
      </div>
      <div role="tablist" aria-label={t('settings.title')} className="mb-4 inline-flex gap-0.5 rounded-ctl border border-line bg-panel p-[3px]">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={settingsTab === tb.key}
            onClick={() => setSettingsTab(tb.key)}
            className={`h-[26px] whitespace-nowrap rounded-[7px] px-2.5 text-[12.5px] font-semibold transition-colors ${
              settingsTab === tb.key ? 'bg-white/[0.12] text-fg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-fg-2 hover:text-fg'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="max-w-[720px]">
        {settingsTab === 'account' && (
          <>
            <Group>
              <Row
                title={email ?? t('settings.account.notSignedIn')}
                sub={signedIn ? t('settings.account.signedIn') : t('settings.account.disconnected')}
              >
                {signedIn && (
                  <Button onClick={() => void account.signOut()} disabled={!configured || account.busy}>
                    {t('settings.account.logout')}
                  </Button>
                )}
              </Row>
              {!signedIn && (
                <div className="flex flex-col gap-2 p-3.5">
                  <Button className="h-10 w-full" onClick={() => void account.signIn('github')} disabled={!configured || account.busy}>
                    <Github />
                    {t('settings.account.signInGithub')}
                  </Button>
                  <Button className="h-10 w-full" onClick={() => void account.signIn('google')} disabled={!configured || account.busy}>
                    <GoogleIcon />
                    {t('settings.account.signInGoogle')}
                  </Button>
                </div>
              )}
            </Group>
            <Group>
              <Row title={t('settings.account.plan')} sub={isPro ? t('settings.account.planPro') : t('settings.account.planFree')}>
                {isPro ? (
                  <Badge tone="pro">PRO</Badge>
                ) : (
                  <Button variant="primary" onClick={() => void account.upgrade()} disabled={account.busy}>
                    {t('settings.account.upgrade')}
                  </Button>
                )}
              </Row>
            </Group>
            {!configured && <Banner tone="error">{t('settings.account.notConfigured')}</Banner>}
            <p className="text-xs text-fg-3">{t('settings.account.hint')}</p>
          </>
        )}

        {settingsTab === 'general' && (
          <Group>
            <Row title={t('settings.general.theme')} sub={t('settings.general.themeOnlyDark')}>
              <Badge>{t('settings.general.dark')}</Badge>
            </Row>
            <Row title={t('settings.general.targetApp')} sub={`${APP_META[agentApp].label} · ${APP_META[agentApp].path}`} />
            <Row title={t('settings.general.language')} sub={t('settings.general.languageSub')}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="min-w-[118px] justify-between">
                    {LOCALE_NAMES[locale]}
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[180px]">
                  <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                    {LOCALES.map((code) => (
                      <DropdownMenuRadioItem key={code} value={code}>
                        {LOCALE_NAMES[code]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </Row>
          </Group>
        )}

        {settingsTab === 'about' && (
          <Group>
            <Row
              title={
                <>
                  <Logo />
                  Agent Store
                </>
              }
              sub={<span className="font-mono">v{appVersion} · {t('settings.about.subtitle')}</span>}
            />
            <Row title={t('settings.about.checkUpdates')} sub={updateMsg ?? undefined}>
              <Button onClick={() => void checkForUpdates()}>{t('settings.about.checkUpdates')}</Button>
            </Row>
            <Row title={t('settings.about.docs')}>
              <Button variant="ghost" onClick={() => void openExternal('https://agent-store-test.panghuli.tech/docs')}>
                {t('settings.about.docs')}
              </Button>
            </Row>
            <Row title={t('settings.about.github')}>
              <Button variant="ghost" onClick={() => void openExternal('https://github.com/awesome-agent-store')}>
                {t('settings.about.github')}
              </Button>
            </Row>
          </Group>
        )}
      </div>
    </div>
  )
}
