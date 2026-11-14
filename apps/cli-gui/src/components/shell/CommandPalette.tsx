import { useEffect, useState, type ReactNode } from 'react'
import { Command } from 'cmdk'
import { Github, Globe, Keyboard, LogOut, RefreshCw, Search, SquareTerminal, Radio } from 'lucide-react'
import type { InstalledItem, UpdateAvailable } from '@as/types'
import { useAppState } from '../../state/AppState'
import { useAuth } from '../../state/Auth'
import { useI18n } from '../../i18n'
import { callRpc } from '../../lib/rpc'
import { modKeyLabel, SECTIONS, type Section } from '../../lib/nav'
import { useNavigate } from '../../lib/useNavigate'
import { useAccountActions } from '../../lib/useAccountActions'
import { Glyph } from '../ui/icons'
import { Kbd } from '../ui/badge'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { toast } from '../ui/toast'
import { CategoryIcon } from '../CategoryIcon'

const SECTION_OF: Record<InstalledItem['category'], Section> = { skill: 'skills', mcp: 'mcp', provider: 'providers' }

function Item({ value, keywords, icon, hint, onSelect, forceMount, children }: {
  value: string
  keywords?: string[]
  icon: ReactNode
  hint?: string
  onSelect: () => void
  forceMount?: boolean
  children: ReactNode
}) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      forceMount={forceMount}
      onSelect={onSelect}
      className="flex min-h-[38px] w-full cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-[5px] text-[13px] data-[selected=true]:bg-panel-2 data-[selected=true]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] [&>svg]:h-4 [&>svg]:w-4 [&>svg]:flex-none [&>svg]:text-fg-2"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <small className="whitespace-nowrap text-[11.5px] text-fg-3">{hint}</small>}
    </Command.Item>
  )
}

const GROUP =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-3'

export function CommandPalette() {
  const { locale, setLocale, t } = useI18n()
  const { paletteOpen, setPaletteOpen, setShellDialog, setSelectedSlug, setEditingConfigSlug, setSearchSeed, installedVersion } = useAppState()
  const { signedIn, configured } = useAuth()
  const account = useAccountActions()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [installed, setInstalled] = useState<InstalledItem[]>([])
  const mod = modKeyLabel()

  useEffect(() => {
    if (!paletteOpen) return
    setSearch('')
    callRpc<InstalledItem[]>('list').then(setInstalled, () => setInstalled([]))
  }, [paletteOpen, installedVersion])

  function run(fn: () => void) {
    setPaletteOpen(false)
    fn()
  }

  async function checkUpdates() {
    try {
      const updates = await callRpc<UpdateAvailable[]>('checkUpdates')
      toast(updates.length ? t('palette.updatesFound').replace('{n}', String(updates.length)) : t('palette.upToDate'))
    } catch {
      toast.error(t('palette.checkFailed'))
    }
  }

  const q = search.trim()

  return (
    <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <DialogContent width="palette" placement="top" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{t('palette.title')}</DialogTitle>
        <Command label={t('palette.title')} loop className="flex min-h-0 flex-col">
          <div className="flex h-12 flex-none items-center gap-2.5 border-b border-line px-3.5">
            <Search size={17} className="text-fg-3" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder={t('palette.placeholder')}
              className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none"
            />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="max-h-[380px] overflow-y-auto p-1.5">
            <Command.Empty className="px-2.5 pb-1 pt-2 font-mono text-[11px] text-fg-3">{t('palette.none')}</Command.Empty>
            <Command.Group heading={t('palette.go')} className={GROUP}>
              {SECTIONS.map((s, i) => (
                <Item
                  key={s.id}
                  value={`go:${s.id}`}
                  keywords={[t(`nav.${s.id}`), s.id]}
                  icon={<Glyph name={s.icon} />}
                  hint={`${mod} ${i + 1}`}
                  onSelect={() => run(() => navigate(s.id))}
                >
                  {t(`nav.${s.id}`)}
                </Item>
              ))}
            </Command.Group>
            <Command.Group heading={t('palette.actions')} className={GROUP}>
              <Item value="act:updates" keywords={[t('palette.checkUpdates')]} icon={<RefreshCw />} onSelect={() => run(() => void checkUpdates())}>
                {t('palette.checkUpdates')}
              </Item>
              {signedIn ? (
                <Item value="act:signout" keywords={[t('account.signout')]} icon={<LogOut />} onSelect={() => run(() => void account.signOut().then((ok) => ok && toast(t('account.signedOut'))))}>
                  {t('account.signout')}
                </Item>
              ) : (
                configured && (
                  <Item value="act:signin" keywords={[t('settings.account.signInGithub')]} icon={<Github />} onSelect={() => run(() => void account.signIn('github'))}>
                    {t('settings.account.signInGithub')}
                  </Item>
                )
              )}
              <Item value="act:lang" keywords={[t('palette.lang'), 'language']} icon={<Globe />} onSelect={() => run(() => setLocale(locale === 'zh' ? 'en' : 'zh'))}>
                {t('palette.lang')}
              </Item>
              <Item value="act:activity" keywords={[t('shell.activityTitle')]} icon={<SquareTerminal />} onSelect={() => run(() => setShellDialog('activity'))}>
                {t('shell.activityTitle')}
              </Item>
              <Item value="act:requestlog" keywords={[t('proxyLog.title')]} icon={<Radio />} onSelect={() => run(() => setShellDialog('requestLog'))}>
                {t('proxyLog.title')}
              </Item>
              <Item value="act:keys" keywords={[t('keys.title')]} icon={<Keyboard />} onSelect={() => run(() => setShellDialog('shortcuts'))}>
                {t('keys.title')}
              </Item>
            </Command.Group>
            {q && installed.length > 0 && (
              <Command.Group heading={t('palette.installed')} className={GROUP}>
                {installed.map((item) => (
                  <Item
                    key={item.slug}
                    value={`installed:${item.slug}`}
                    keywords={[item.slug]}
                    icon={<CategoryIcon category={item.category} size="sm" />}
                    hint={t(`categories.${item.category}`)}
                    onSelect={() =>
                      run(() => {
                        navigate(SECTION_OF[item.category])
                        setEditingConfigSlug(null)
                        setSelectedSlug(item.slug)
                      })
                    }
                  >
                    {item.slug}
                  </Item>
                ))}
              </Command.Group>
            )}
            {q && (
              <Command.Group heading={t('palette.catalog')} className={GROUP} forceMount>
                <Item
                  value="catalog:search"
                  forceMount
                  icon={<Search />}
                  onSelect={() =>
                    run(() => {
                      navigate('discover')
                      setSearchSeed(q)
                    })
                  }
                >
                  {t('palette.searchFor').replace('{q}', q)}
                </Item>
              </Command.Group>
            )}
          </Command.List>
          <div className="flex flex-none gap-3.5 border-t border-line px-3.5 py-2 text-[11.5px] text-fg-3">
            <span className="flex items-center gap-[5px]">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              {t('palette.move')}
            </span>
            <span className="flex items-center gap-[5px]">
              <Kbd>Enter</Kbd>
              {t('palette.run')}
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
