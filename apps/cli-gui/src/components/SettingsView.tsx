import { useEffect, useState, type ReactNode } from 'react'
import { Copy, ExternalLink, Github, Keyboard, RefreshCw, Stethoscope } from 'lucide-react'
import type { InstalledItem, UpdateAvailable } from '@as/types'
import { useAppState, type AgentApp, type SettingsTab } from '../state/AppState'
import { useAuth } from '../state/Auth'
import { useEntitlement, type ProFeature } from '../state/Entitlement'
import { useTerminalLog } from '../state/TerminalLog'
import { useI18n, LOCALES, LOCALE_NAMES } from '../i18n'
import { callRpc, errorText } from '../lib/rpc'
import { openExternal } from '../lib/openExternal'
import { getStoreBaseUrl } from '../lib/storeAuth'
import { useAccountActions } from '../lib/useAccountActions'
import { AGENTS } from '../lib/agents'
import { AgentMark } from './AgentMark'
import { CategoryIcon } from './CategoryIcon'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Row, RowGroup } from './ui/card'
import { Segmented } from './ui/segmented'
import { Banner, Spinner } from './ui/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Logo } from './ui/icons'
import { toast } from './ui/toast'
import { version as appVersion } from '../../src-tauri/tauri.conf.json'

/** What the `doctor` RPC returns (apps/client-core/src/doctor.ts). */
interface DoctorFinding {
  level: 'error' | 'warn'
  code: string
  slug?: string
  message: string
}

const TABS: SettingsTab[] = ['general', 'agents', 'data', 'account', 'cli', 'about']

const CLI_COMMANDS: [string, string][] = [
  ['search [query] [--kind <skill|mcp|provider>]', 'search'],
  ['install <id|slug> [--target <agent>] [--project <id|dir>] [--force]', 'install'],
  ['uninstall <slug> [--project <id|dir> [--target <agent>]] [--force]', 'uninstall'],
  ['projects <list|add|remove|move|show|set-env|unset-env|env|exec>', 'projects'],
  ['enable <slug> --for <agent> [--replace] [--force]', 'enable'],
  ['disable <slug> --for <agent> [--force]', 'disable'],
  ['config <slug>', 'config'],
  ['sync [--for <agent>]', 'sync'],
  ['relay <start|stop|status>', 'relay'],
  ['usage [--days N] [--provider <slug>] [--for <agent>]', 'usage'],
  ['update [slug]', 'update'],
  ['info <id|slug>', 'info'],
  ['list [--for <agent>]', 'list'],
  ['doctor', 'doctor'],
  ['migrate', 'migrate'],
]

const PRO_FEATURES: [ProFeature, string][] = [
  ['advancedUsageAnalytics', 'budget'],
  ['smartRouting', 'smartRouting'],
  ['keyRotation', 'keyRotation'],
]

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

function Heading({ children }: { children: ReactNode }) {
  return <p className="mb-2 ml-0.5 text-xs font-semibold text-fg-3">{children}</p>
}

function Mono({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[11.5px] text-fg-2">{children}</code>
}

function fill(template: string, values: ReactNode[]): ReactNode[] {
  return template.split(/(\{\d\})/).map((part, i) => {
    const m = /^\{(\d)\}$/.exec(part)
    return m ? <Mono key={i}>{values[Number(m[1])]}</Mono> : part
  })
}

function GeneralTab() {
  const { locale, setLocale, t } = useI18n()
  const { agentApp, setAgentApp, setShellDialog } = useAppState()
  return (
    <>
      <RowGroup>
        <Row title={t('settings.general.language')} sub={t('settings.general.languageSub')}>
          <Segmented
            label={t('settings.general.language')}
            value={locale}
            onChange={setLocale}
            options={LOCALES.map((code) => ({ value: code, label: LOCALE_NAMES[code] }))}
          />
        </Row>
        <Row title={t('settings.general.theme')} sub={t('settings.general.themeOnlyDark')}>
          <Badge>{t('settings.general.dark')}</Badge>
        </Row>
        <Row title={t('settings.general.targetApp')} sub={t('settings.general.targetAppSub')}>
          <Segmented<AgentApp>
            label={t('settings.general.targetApp')}
            value={agentApp}
            onChange={setAgentApp}
            options={AGENTS.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Row>
        <Row title={t('settings.general.shortcuts')} sub={t('settings.general.shortcutsSub')}>
          <Button size="sm" onClick={() => setShellDialog('shortcuts')}>
            <Keyboard />
            {t('settings.general.view')}
          </Button>
        </Row>
      </RowGroup>
      <RowGroup>
        <Row title={t('settings.general.welcome')} sub={t('settings.general.welcomeSub')}>
          <Button size="sm" onClick={() => setShellDialog('welcome')}>
            {t('settings.general.welcomeBtn')}
          </Button>
        </Row>
      </RowGroup>
    </>
  )
}

function DoctorResult({ findings }: { findings: DoctorFinding[] }) {
  const { t } = useI18n()
  if (findings.length === 0) return <Banner tone="info" title={t('settings.agents.doctorOk')} />
  const errors = findings.filter((f) => f.level === 'error').length
  return (
    <Banner
      tone={errors ? 'error' : 'warn'}
      title={t('settings.agents.doctorFound').replace('{e}', String(errors)).replace('{w}', String(findings.length - errors))}
    >
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {findings.map((f, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2">
            <Badge tone={f.level === 'error' ? 'bad' : 'warn'}>{f.level === 'error' ? t('settings.agents.error') : t('settings.agents.warn')}</Badge>
            <Mono>
              {f.code}
              {f.slug ? ` [${f.slug}]` : ''}
            </Mono>
            <span className="min-w-0 break-words text-fg-2">{f.message}</span>
          </li>
        ))}
      </ul>
    </Banner>
  )
}

function AgentsTab() {
  const { t } = useI18n()
  const [state, setState] = useState<{ status: 'idle' | 'running' | 'done' | 'failed'; findings: DoctorFinding[]; error?: string }>({
    status: 'idle',
    findings: [],
  })

  async function runDoctor() {
    setState({ status: 'running', findings: [] })
    try {
      setState({ status: 'done', findings: await callRpc<DoctorFinding[]>('doctor') })
    } catch (err) {
      setState({ status: 'failed', findings: [], error: errorText(err) })
    }
  }

  return (
    <>
      <Heading>{t('settings.agents.heading')}</Heading>
      <RowGroup>
        {AGENTS.map((a) => (
          <Row
            key={a.id}
            title={
              <>
                <AgentMark mark={a.mark} />
                {a.name}
              </>
            }
            sub={fill(t('settings.agents.paths'), [a.skills, a.mcp, a.env])}
          />
        ))}
        <Row
          muted
          title={
            <>
              <AgentMark mark="+" soon />
              {t('settings.agents.more')}
            </>
          }
          sub={t('settings.agents.moreSub')}
        />
      </RowGroup>
      <RowGroup>
        <Row title={t('settings.agents.doctor')} sub={t('settings.agents.doctorSub')}>
          <Button size="sm" onClick={() => void runDoctor()} disabled={state.status === 'running'}>
            {state.status === 'running' ? <Spinner className="h-3.5 w-3.5" /> : <Stethoscope />}
            {state.status === 'running' ? t('settings.agents.doctorRunning') : t('settings.agents.doctorRun')}
          </Button>
        </Row>
      </RowGroup>
      {state.status === 'done' && <DoctorResult findings={state.findings} />}
      {state.status === 'failed' && (
        <Banner tone="error" title={t('settings.agents.doctorFailed')}>
          {state.error}
        </Banner>
      )}
    </>
  )
}

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n()
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('ui.copied'))
    } catch {
      toast.error(t('ui.copyFail'))
    }
  }
  return (
    <Button size="sm" icon aria-label={`${t('settings.data.copy')} ${text}`} title={t('settings.data.copy')} onClick={() => void copy()}>
      <Copy />
    </Button>
  )
}

function DataTab() {
  const { t } = useI18n()
  const { installedVersion } = useAppState()
  const [skills, setSkills] = useState<number | null>(null)

  useEffect(() => {
    callRpc<InstalledItem[]>('list').then((items) => setSkills(items.filter((i) => i.category === 'skill').length), () => setSkills(null))
  }, [installedVersion])

  const rows: [string, ReactNode, string][] = [
    [t('settings.data.home'), t('settings.data.homeSub'), '~/.agent-store/'],
    [t('settings.data.skills'), skills == null ? null : t('settings.data.skillsSub').replace('{n}', String(skills)), '~/.agent-store/skills/'],
    [t('settings.data.backups'), t('settings.data.backupsSub'), '~/.agent-store/backups/'],
    [t('settings.data.exports'), null, '~/.agent-store/exports/'],
  ]
  return (
    <RowGroup>
      {rows.map(([title, sub, path]) => (
        <Row
          key={path}
          title={title}
          sub={
            <>
              <Mono>{path}</Mono>
              {sub && <> · {sub}</>}
            </>
          }
        >
          <CopyButton text={path} />
        </Row>
      ))}
    </RowGroup>
  )
}

function AccountTab() {
  const { locale, t } = useI18n()
  const { email, signedIn, configured, persisted, notice } = useAuth()
  const { entitlements, has } = useEntitlement()
  const account = useAccountActions()
  const isPro = entitlements.plan !== 'free'

  async function upgrade() {
    if (!(await account.upgrade())) toast.error(t('settings.account.upgradeFailed'))
  }

  return (
    <>
      {signedIn && !persisted && (
        <div className="mb-4">
          <Banner tone="warn" title={t('auth.notSavedT')}>
            <p>{t('auth.notSavedD')}</p>
          </Banner>
        </div>
      )}
      {!signedIn && notice === 'expired' && (
        <div className="mb-4">
          <Banner tone="warn" title={t('auth.expiredT')}>
            <p>{t('auth.expiredD')}</p>
          </Banner>
        </div>
      )}
      <RowGroup>
        {signedIn ? (
          <Row
            title={
              <>
                <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-[image:var(--brand)] text-xs font-bold text-canvas">
                  {(email ?? 'A').charAt(0).toUpperCase()}
                </span>
                {email ?? t('settings.account.signedIn')}
              </>
            }
            sub={persisted ? [t('settings.account.signedInSub'), t('auth.saved')].join(locale === 'zh' ? '' : ' ') : t('settings.account.signedInSub')}
          >
            <Button size="sm" onClick={() => void account.signOut()} disabled={!configured || account.busy}>
              {t('settings.account.logout')}
            </Button>
          </Row>
        ) : (
          <Row title={t('settings.account.notSignedIn')} sub={t('settings.account.notSignedInSub')}>
            <Button size="sm" onClick={() => void account.signIn('github')} disabled={!configured || account.busy}>
              <Github />
              {t('settings.account.signInGithub')}
            </Button>
            <Button size="sm" onClick={() => void account.signIn('google')} disabled={!configured || account.busy}>
              <GoogleIcon />
              {t('settings.account.signInGoogle')}
            </Button>
          </Row>
        )}
        <Row
          title={
            <>
              {t('settings.account.plan')}
              <Badge tone={isPro ? 'pro' : 'neutral'}>{isPro ? 'Pro' : 'Free'}</Badge>
            </>
          }
          sub={isPro ? t('settings.account.planPro') : t('settings.account.planFree')}
        >
          {!isPro && (
            <Button size="sm" variant="primary" onClick={() => void upgrade()} disabled={account.busy}>
              {t('settings.account.upgrade')}
              <ExternalLink />
            </Button>
          )}
        </Row>
      </RowGroup>
      {!configured && (
        <div className="mb-4">
          <Banner tone="error">{t('settings.account.notConfigured')}</Banner>
        </div>
      )}
      <Heading>{t('settings.account.what')}</Heading>
      <RowGroup>
        {PRO_FEATURES.map(([feature, key]) => (
          <Row
            key={feature}
            title={
              <>
                {t(`pro.${key}.title`)}
                <Badge tone="pro">Pro</Badge>
              </>
            }
            sub={t(`pro.${key}.desc`)}
          >
            <Badge tone={has(feature) ? 'ok' : 'neutral'}>{has(feature) ? t('settings.account.active') : t('settings.account.locked')}</Badge>
          </Row>
        ))}
      </RowGroup>
      <p className="text-xs text-fg-3">{t('settings.account.cached')}</p>
    </>
  )
}

function CliTab() {
  const { t } = useI18n()
  return (
    <>
      <p className="mb-3 max-w-[70ch] text-fg-2">{t('settings.cli.intro')}</p>
      <div className="mb-3 flex items-center gap-2 rounded-[9px] border border-line bg-code px-3 py-2 font-mono text-xs">
        <span className="text-fg-3">$</span>
        <span className="flex-1">aas --help</span>
        <span className="font-sans text-fg-3">{t('settings.cli.help')}</span>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-box border border-line bg-panel p-4 text-[12.5px]">
        {CLI_COMMANDS.map(([usage, key]) => (
          <div key={key} className="contents">
            <code className="whitespace-nowrap font-mono text-xs text-fg">aas {usage}</code>
            <span className="text-fg-3">{t(`settings.cli.${key}`)}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function UpdatesRow() {
  const { t } = useI18n()
  const { bumpInstalledVersion } = useAppState()
  const { appendLine } = useTerminalLog()
  const [state, setState] = useState<'idle' | 'checking' | 'done' | 'failed'>('idle')
  const [updates, setUpdates] = useState<UpdateAvailable[]>([])
  const [installed, setInstalled] = useState<InstalledItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  async function check() {
    setState('checking')
    try {
      const [found, items] = await Promise.all([callRpc<UpdateAvailable[]>('checkUpdates'), callRpc<InstalledItem[]>('list').catch(() => [])])
      setUpdates(found)
      setInstalled(items)
      setState('done')
    } catch {
      setState('failed')
    }
  }

  async function update(slug: string | null) {
    setBusy(slug ?? '*')
    appendLine(`$ aas update${slug ? ` ${slug}` : ''}`)
    try {
      await callRpc('update', slug ? [slug] : [])
      appendLine(`✓ ${t('settings.about.updated')}${slug ? ` ${slug}` : ''}`, 'green')
      toast(t('settings.about.updated'))
    } catch (err) {
      appendLine(`✗ ${errorText(err)}`, 'red')
      toast.error(t('settings.about.updateFailed'))
    } finally {
      setBusy(null)
      bumpInstalledVersion()
      await check()
    }
  }

  const status =
    state === 'checking'
      ? t('settings.about.checking')
      : state === 'failed'
        ? t('settings.about.checkFailed')
        : state === 'done'
          ? updates.length
            ? t('settings.about.found').replace('{n}', String(updates.length))
            : t('settings.about.upToDate')
          : t('settings.about.updatesSub')

  return (
    <>
      <Row title={t('settings.about.updates')} sub={<span role="status">{status}</span>}>
        {state === 'done' && updates.length > 1 && (
          <Button size="sm" onClick={() => void update(null)} disabled={busy !== null}>
            {t('settings.about.updateAll')}
          </Button>
        )}
        <Button size="sm" onClick={() => void check()} disabled={state === 'checking' || busy !== null}>
          {state === 'checking' ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw />}
          {t('settings.about.check')}
        </Button>
      </Row>
      {state === 'done' &&
        updates.map((u) => (
          <Row
            key={u.slug}
            title={
              <>
                <CategoryIcon category={installed.find((i) => i.slug === u.slug)?.category ?? 'mcp'} size="sm" />
                {u.slug}
              </>
            }
            sub={
              <span className="font-mono">
                {u.currentVersion} → {u.latestVersion}
              </span>
            }
          >
            <Button size="sm" variant="primary" onClick={() => void update(u.slug)} disabled={busy !== null}>
              {busy === u.slug || busy === '*' ? t('settings.about.updating') : t('settings.about.update')}
            </Button>
          </Row>
        ))}
    </>
  )
}

function AboutTab() {
  const { t } = useI18n()
  const base = getStoreBaseUrl()
  return (
    <RowGroup>
      <Row
        title={
          <>
            <Logo />
            Agent Store
            <span className="font-mono text-xs font-medium text-fg-3">v{appVersion}</span>
          </>
        }
        sub={
          <>
            {t('settings.about.tagline')}
            <br />
            {t('settings.about.support')}
          </>
        }
      >
        <Button size="sm" onClick={() => void openExternal(`${base}/download`)}>
          {t('settings.about.download')}
          <ExternalLink />
        </Button>
      </Row>
      <UpdatesRow />
      <Row title={t('settings.about.docs')}>
        <Button size="sm" onClick={() => void openExternal(`${base}/docs`)}>
          {t('settings.about.docs')}
          <ExternalLink />
        </Button>
        <Button size="sm" onClick={() => void openExternal('https://github.com/awesome-agent-store')}>
          {t('settings.about.github')}
          <ExternalLink />
        </Button>
      </Row>
    </RowGroup>
  )
}

export function SettingsView() {
  const { settingsTab, setSettingsTab } = useAppState()
  const { t } = useI18n()
  const content: Record<SettingsTab, () => JSX.Element> = {
    general: GeneralTab,
    agents: AgentsTab,
    data: DataTab,
    account: AccountTab,
    cli: CliTab,
    about: AboutTab,
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-6 pt-[18px] max-[1040px]:px-4">
      <div className="mb-3.5 flex flex-wrap items-end gap-3">
        <h1 className="text-[19px] font-extrabold leading-[1.3]">{t('settings.title')}</h1>
      </div>
      <Tabs value={settingsTab} onValueChange={(v) => setSettingsTab(v as SettingsTab)}>
        <TabsList aria-label={t('settings.title')} className="mb-4">
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`settings.tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((tab) => {
          const Body = content[tab]
          return (
            <TabsContent key={tab} value={tab} className="max-w-[760px] focus-visible:outline-none">
              <Body />
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
