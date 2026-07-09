import { useEffect, useMemo, useState } from 'react'
import type { Item, InstalledItem, ItemDetail, UpdateAvailable } from '@as/types'
import { Search, Filter, Check } from 'lucide-react'
import { callRpc } from '../lib/rpc'
import { useAppState, type AgentApp, type ListFilter } from '../state/AppState'
import { useTerminalLog } from '../state/TerminalLog'
import { useT } from '../i18n'
import { CategoryIcon } from './CategoryIcon'
import { TIER_META } from '../lib/detailContent'
import {
  matchesCategoryFilter, matchesText, enrichInstalled, filterInstalledByListFilter,
  filterRecommendedByListFilter, showInstalledSection, showRecommendedSection,
  type EnrichedInstalledItem,
} from '../lib/resources'

const DISCOVERY_TOKENS: Exclude<ListFilter, 'all'>[] = ['featured', 'popular', 'recent', 'recommended']
const STATUS_TOKENS: Exclude<ListFilter, 'all'>[] = ['installed', 'updates', 'enabled', 'disabled']

const APP_OPTIONS: { key: AgentApp; label: string; letter: string; color: string }[] = [
  { key: 'claude', label: 'Claude Code', letter: 'C', color: '#d2785a' },
  { key: 'codex', label: 'Codex', letter: 'X', color: '#10a37f' },
]

export function ResourceList() {
  const {
    agentApp, setAgentApp, categoryFilter, listFilter, setListFilter,
    selectedSlug, setSelectedSlug, navView,
    installedVersion, bumpInstalledVersion,
    editingConfigSlug, setEditingConfigSlug,
  } = useAppState()
  const { appendLine } = useTerminalLog()
  const t = useT()
  const [installed, setInstalled] = useState<EnrichedInstalledItem[]>([])
  const [catalog, setCatalog] = useState<Item[]>([])
  const [updates, setUpdates] = useState<UpdateAvailable[]>([])
  const [textQuery, setTextQuery] = useState('')
  const [tokenMenuOpen, setTokenMenuOpen] = useState(false)

  function openConfigEditor(slug: string) {
    setEditingConfigSlug(slug)
    setSelectedSlug(slug)
  }

  function selectResource(slug: string) {
    setEditingConfigSlug(null)
    setSelectedSlug(slug)
  }

  async function refreshInstalled() {
    const result = await callRpc<InstalledItem[]>('list')
    const details = await Promise.all(result.map((item) => callRpc<ItemDetail>('info', [item.slug])))
    setInstalled(result.map((item, i) => enrichInstalled(item, details[i])))
  }

  async function refreshCatalog() {
    setCatalog(await callRpc<Item[]>('search', ['']))
  }

  async function refreshUpdates() {
    setUpdates(await callRpc<UpdateAvailable[]>('checkUpdates'))
  }

  useEffect(() => {
    refreshInstalled()
    refreshCatalog()
    refreshUpdates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installedVersion])

  const installedSlugs = useMemo(() => new Set(installed.map((i) => i.slug)), [installed])
  const updatableSlugs = useMemo(() => new Set(updates.map((u) => u.slug)), [updates])

  const rootInstalled = useMemo(() => installed.filter((i) => !i.parentSlug), [installed])
  const childrenByParent = useMemo(() => {
    const map = new Map<string, EnrichedInstalledItem[]>()
    for (const item of installed) {
      if (!item.parentSlug) continue
      const list = map.get(item.parentSlug) ?? []
      list.push(item)
      map.set(item.parentSlug, list)
    }
    return map
  }, [installed])

  const visibleInstalled = useMemo(
    () =>
      filterInstalledByListFilter(
        rootInstalled.filter(
          (i) => matchesCategoryFilter(i.category, categoryFilter) && matchesText(i.name, i.description, textQuery)
        ),
        listFilter,
        agentApp,
        updatableSlugs
      ),
    [rootInstalled, categoryFilter, textQuery, listFilter, agentApp, updatableSlugs]
  )

  const recommendedBase = useMemo(
    () =>
      catalog.filter(
        (item) =>
          (!installedSlugs.has(item.slug) || item.category === 'provider') &&
          matchesCategoryFilter(item.category, categoryFilter) &&
          matchesText(item.name, item.description, textQuery)
      ),
    [catalog, installedSlugs, categoryFilter, textQuery]
  )

  const visibleRecommended = useMemo(
    () => filterRecommendedByListFilter(recommendedBase, listFilter),
    [recommendedBase, listFilter]
  )

  function handleSearchInput(value: string) {
    if (value.startsWith('@')) {
      setTokenMenuOpen(true)
      return
    }
    setTokenMenuOpen(false)
    setTextQuery(value)
    if (listFilter !== 'all') setListFilter('all')
  }

  function selectToken(key: Exclude<ListFilter, 'all'>) {
    setListFilter(key)
    setTextQuery('')
    setTokenMenuOpen(false)
  }

  function selectApp(key: AgentApp) {
    setAgentApp(key)
    setTokenMenuOpen(false)
  }

  function clearSearch() {
    setTextQuery('')
    setListFilter('all')
    setTokenMenuOpen(false)
  }

  async function uninstall(item: EnrichedInstalledItem) {
    appendLine(`$ aas uninstall ${item.slug}`)
    try {
      await callRpc('uninstall', [item.slug])
      appendLine(`✓ ${t('resList.uninstalledPrefix')} ${item.slug}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    if (selectedSlug === item.slug) setSelectedSlug(null)
    if (editingConfigSlug === item.slug) setEditingConfigSlug(null)
    bumpInstalledVersion()
  }

  async function install(item: Item) {
    appendLine(`$ aas install ${item.slug}`)
    try {
      const result = await callRpc<{ version: string }>('install', [item.slug])
      appendLine(`✓ ${t('common.installed')} ${item.slug} ${result.version}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    bumpInstalledVersion()
  }

  async function addChildConfig(item: EnrichedInstalledItem) {
    appendLine(`$ aas duplicate ${item.slug}`)
    try {
      const result = await callRpc<{ newSlug: string }>('duplicateProvider', [item.slug])
      appendLine(`✓ ${t('resList.childAddedPrefix')} ${result.newSlug}`, 'green')
      openConfigEditor(result.newSlug)
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    bumpInstalledVersion()
  }

  async function configureProvider(item: Item) {
    appendLine(`$ aas configure ${item.slug}`)
    try {
      if (installedSlugs.has(item.slug)) {
        const result = await callRpc<{ newSlug: string }>('duplicateProvider', [item.slug])
        appendLine(`✓ ${t('resList.childAddedPrefix')} ${result.newSlug}`, 'green')
        openConfigEditor(result.newSlug)
      } else {
        await callRpc('install', [item.slug])
        appendLine(`✓ ${t('common.installed')} ${item.slug}`, 'green')
        openConfigEditor(item.slug)
      }
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    bumpInstalledVersion()
  }

  const searchValue = listFilter === 'all' ? textQuery : `@${listFilter}`

  return (
    <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-store-border p-4">
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-store-text-3" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder={t('resList.searchPlaceholder')}
              className="w-full rounded-lg border border-store-border bg-store-panel py-2 pl-8 pr-8 font-mono text-sm text-store-accent"
            />
            {(textQuery !== '' || listFilter !== 'all') && (
              <button
                type="button"
                aria-label={t('resList.clear')}
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-store-text-3 hover:text-store-text"
              >
                ×
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label={t('resList.filter')}
            title={t('resList.filter')}
            onClick={() => setTokenMenuOpen((v) => !v)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
              tokenMenuOpen ? 'border-store-accent bg-store-accent-soft text-store-accent' : 'border-store-border bg-store-panel text-store-text-3 hover:text-store-text'
            }`}
          >
            <Filter size={14} />
          </button>
        </div>

        {tokenMenuOpen && (
          <div
            onMouseLeave={() => setTokenMenuOpen(false)}
            className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-store-border-strong bg-store-content p-1.5 shadow-lg"
          >
            <p className="px-2 pb-1 pt-1 text-[9.5px] font-bold uppercase tracking-wide text-store-text-3">{t('resList.discover')}</p>
            {DISCOVERY_TOKENS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => selectToken(key)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                  listFilter === key ? 'bg-store-accent-soft text-store-accent' : 'text-store-text hover:bg-store-panel-2'
                }`}
              >
                <span className="flex-1 text-xs font-medium">{t(`filters.${key}`)}</span>
                <span className="font-mono text-[10px] text-store-text-3">@{key}</span>
              </button>
            ))}
            <div className="my-1 h-px bg-store-border" />
            <p className="px-2 pb-1 pt-1 text-[9.5px] font-bold uppercase tracking-wide text-store-text-3">{t('resList.status')}</p>
            {STATUS_TOKENS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => selectToken(key)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                  listFilter === key ? 'bg-store-accent-soft text-store-accent' : 'text-store-text hover:bg-store-panel-2'
                }`}
              >
                <span className="flex-1 text-xs font-medium">{t(`filters.${key}`)}</span>
                <span className="font-mono text-[10px] text-store-text-3">@{key}</span>
              </button>
            ))}
            <div className="my-1 h-px bg-store-border" />
            <p className="px-2 pb-1 pt-1 text-[9.5px] font-bold uppercase tracking-wide text-store-text-3">{t('resList.targetApp')}</p>
            {APP_OPTIONS.map((app) => (
              <button
                key={app.key}
                type="button"
                onClick={() => selectApp(app.key)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-store-panel-2"
              >
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
                  style={{ background: app.color }}
                >
                  {app.letter}
                </span>
                <span className="flex-1 text-xs font-medium text-store-text">{app.label}</span>
                {agentApp === app.key && <Check size={13} className="text-store-accent" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {navView === 'browse' && showInstalledSection(listFilter) && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-store-text-2">
            {t('resList.configured')} <span className="rounded-full bg-store-panel-2 px-1.5">{visibleInstalled.length}</span>
          </p>
          <div className="flex flex-col gap-1">
            {visibleInstalled.map((item) => {
              const outdated = updatableSlugs.has(item.slug)
              return (
                <div key={item.slug}>
                  <div
                    onClick={() => selectResource(item.slug)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 ${
                      selectedSlug === item.slug ? 'border-store-accent bg-store-accent-soft' : 'border-store-border bg-store-panel'
                    }`}
                  >
                    <CategoryIcon category={item.category} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-sm font-bold text-store-text">{item.name}</span>
                        {outdated && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-store-amber" />}
                      </div>
                      <p className="truncate text-xs text-store-text-3">
                        {item.publisher.name} · {item.category}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {item.category === 'provider' && (
                        <button
                          type="button"
                          aria-label={`${t('resList.addChildAria')} ${item.slug}`}
                          onClick={() => addChildConfig(item)}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-store-text-3 hover:bg-store-panel-2 hover:text-store-text"
                        >
                          +
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`${t('resList.uninstallAria')} ${item.slug}`}
                        onClick={() => uninstall(item)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-store-text-3 hover:bg-store-panel-2 hover:text-store-red"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {item.category === 'provider' && (childrenByParent.get(item.slug)?.length ?? 0) > 0 && (
                    <div className="mt-1 flex flex-col gap-1">
                      {childrenByParent.get(item.slug)!.map((child) => (
                        <div
                          key={child.slug}
                          onClick={() => openConfigEditor(child.slug)}
                          className={`relative flex cursor-pointer items-center gap-2 rounded-md py-1.5 pl-[30px] pr-2 text-xs ${
                            selectedSlug === child.slug ? 'bg-store-accent-soft text-store-accent' : 'text-store-text-2 hover:bg-store-panel'
                          }`}
                        >
                          <span className="pointer-events-none absolute left-4 top-0 h-1/2 w-2 rounded-bl-md border-b border-l border-store-border-strong" />
                          <span className="flex-1 truncate font-mono">{child.slug}</span>
                          <button
                            type="button"
                            aria-label={`${t('resList.deleteAria')} ${child.slug}`}
                            onClick={(e) => { e.stopPropagation(); uninstall(child) }}
                            className="text-store-text-3 hover:text-store-red"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {navView === 'browse' && showRecommendedSection(listFilter) && (
        <div>
          <p className="mb-2 text-xs font-medium text-store-text-2">
            {t('resList.recommended')} <span className="rounded-full bg-store-panel-2 px-1.5">{visibleRecommended.length}</span>
          </p>
          <div className="flex flex-col gap-1">
            {visibleRecommended.map((item) => (
              <div
                key={item.slug}
                onClick={() => selectResource(item.slug)}
                className={`cursor-pointer rounded-lg border px-3 py-2 ${
                  selectedSlug === item.slug ? 'border-store-accent bg-store-accent-soft' : 'border-store-border bg-store-panel'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="flex items-center gap-1 text-sm text-store-text">
                      <span className="truncate">{item.name}</span>
                      {item.publisher.tier !== 'community' && (
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 16 16"
                          fill="none"
                          className={`shrink-0 ${TIER_META[item.publisher.tier]?.textClass ?? ''}`}
                        >
                          <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" />
                          <path d="M6 8l1.5 1.5L11 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </p>
                    <p className="text-xs text-store-text-3">
                      ★ {item.rating} · ↓ {item.downloads}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (item.category === 'provider') configureProvider(item)
                      else install(item)
                    }}
                    className="rounded-md bg-store-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    {item.category === 'provider' ? t('resList.configure') : t('common.install')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
