import { useEffect, useMemo, useState } from 'react'
import type { Item, InstalledItem, ItemDetail, UpdateAvailable } from '@aas/types'
import { Search } from 'lucide-react'
import { callRpc } from '../lib/rpc'
import { useAppState, type ListFilter } from '../state/AppState'
import { useTerminalLog } from '../state/TerminalLog'
import { ProviderEditModal } from './ProviderEditModal'
import {
  matchesCategoryFilter, matchesText, enrichInstalled, filterInstalledByListFilter,
  filterRecommendedByListFilter, showInstalledSection, showRecommendedSection,
  type EnrichedInstalledItem,
} from '../lib/resources'

const FILTER_TOKENS: { key: Exclude<ListFilter, 'all'>; label: string }[] = [
  { key: 'popular', label: '最热门' },
  { key: 'recent', label: '最近发布' },
  { key: 'installed', label: '已安装' },
  { key: 'enabled', label: '已启用' },
  { key: 'disabled', label: '已禁用' },
  { key: 'favorites', label: '收藏' },
]

export function ResourceList() {
  const {
    agentApp, setAgentApp, categoryFilter, listFilter, setListFilter,
    selectedSlug, setSelectedSlug, favoriteSlugs, navView,
    installedVersion, bumpInstalledVersion,
  } = useAppState()
  const { appendLine } = useTerminalLog()
  const [installed, setInstalled] = useState<EnrichedInstalledItem[]>([])
  const [catalog, setCatalog] = useState<Item[]>([])
  const [updates, setUpdates] = useState<UpdateAvailable[]>([])
  const [textQuery, setTextQuery] = useState('')
  const [tokenMenuOpen, setTokenMenuOpen] = useState(false)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installedVersion])

  useEffect(() => {
    if (navView === 'updates') refreshUpdates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navView])

  const installedSlugs = useMemo(() => new Set(installed.map((i) => i.slug)), [installed])

  const visibleInstalled = useMemo(
    () =>
      filterInstalledByListFilter(
        installed.filter(
          (i) => matchesCategoryFilter(i.category, categoryFilter) && matchesText(i.name, i.description, textQuery)
        ),
        listFilter,
        agentApp,
        favoriteSlugs
      ),
    [installed, categoryFilter, textQuery, listFilter, agentApp, favoriteSlugs]
  )

  const recommendedBase = useMemo(
    () =>
      catalog.filter(
        (item) =>
          !installedSlugs.has(item.slug) &&
          matchesCategoryFilter(item.category, categoryFilter) &&
          matchesText(item.name, item.description, textQuery)
      ),
    [catalog, installedSlugs, categoryFilter, textQuery]
  )

  const visibleRecommended = useMemo(
    () => filterRecommendedByListFilter(recommendedBase, listFilter, favoriteSlugs),
    [recommendedBase, listFilter, favoriteSlugs]
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

  function clearSearch() {
    setTextQuery('')
    setListFilter('all')
    setTokenMenuOpen(false)
  }

  async function toggleEnabled(item: EnrichedInstalledItem) {
    const isEnabled = !!item.enabledFor[agentApp]
    appendLine(`$ aas ${isEnabled ? 'disable' : 'enable'} ${item.slug} --for ${agentApp}`)
    try {
      await callRpc(isEnabled ? 'disable' : 'enable', [item.slug, agentApp])
      appendLine(`✓ ${item.slug} ${isEnabled ? '已禁用' : '已启用'} (${agentApp})`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    bumpInstalledVersion()
  }

  async function uninstall(item: EnrichedInstalledItem) {
    appendLine(`$ aas uninstall ${item.slug}`)
    try {
      await callRpc('uninstall', [item.slug])
      appendLine(`✓ 已卸载 ${item.slug}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    if (selectedSlug === item.slug) setSelectedSlug(null)
    bumpInstalledVersion()
  }

  async function install(item: Item) {
    appendLine(`$ aas install ${item.slug}`)
    try {
      const result = await callRpc<{ version: string }>('install', [item.slug])
      appendLine(`✓ 已安装 ${item.slug} ${result.version}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    bumpInstalledVersion()
  }

  async function duplicateProvider(item: EnrichedInstalledItem) {
    appendLine(`$ aas duplicate ${item.slug}`)
    try {
      const result = await callRpc<{ newSlug: string }>('duplicateProvider', [item.slug])
      appendLine(`✓ 已复制 ${item.slug} → ${result.newSlug}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    bumpInstalledVersion()
  }

  async function updateAll() {
    appendLine('$ aas update')
    try {
      await callRpc('update')
      appendLine('✓ 已全部更新', 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    refreshUpdates()
    refreshInstalled()
  }

  async function updateOne(slug: string) {
    appendLine(`$ aas update ${slug}`)
    try {
      await callRpc('update', [slug])
      appendLine(`✓ 已更新 ${slug}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    refreshUpdates()
    refreshInstalled()
  }

  const searchValue = listFilter === 'all' ? textQuery : `@${listFilter}`

  return (
    <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-store-border p-4">
      <div className="flex gap-1 rounded-lg border border-store-border bg-store-panel p-1 text-xs">
        <button
          type="button"
          onClick={() => setAgentApp('claude')}
          className={`flex-1 rounded-md px-2 py-1.5 ${agentApp === 'claude' ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'}`}
        >
          Claude Code
        </button>
        <button
          type="button"
          onClick={() => setAgentApp('codex')}
          className={`flex-1 rounded-md px-2 py-1.5 ${agentApp === 'codex' ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'}`}
        >
          Codex
        </button>
      </div>

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-store-text-3" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="搜索，或用 @ 过滤…"
          className="w-full rounded-lg border border-store-border bg-store-panel py-2 pl-8 pr-8 text-sm text-store-text"
        />
        {(textQuery !== '' || listFilter !== 'all') && (
          <button
            type="button"
            aria-label="清除"
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-store-text-3 hover:text-store-text"
          >
            ×
          </button>
        )}
        {tokenMenuOpen && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-store-border bg-store-content p-1 shadow-lg">
            {FILTER_TOKENS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => selectToken(t.key)}
                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-store-text hover:bg-store-panel-2"
              >
                @{t.key} · {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {navView === 'browse' && showInstalledSection(listFilter) && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-store-text-2">
            已安装 <span className="rounded-full bg-store-panel-2 px-1.5">{visibleInstalled.length}</span>
          </p>
          <div className="flex flex-col gap-1">
            {visibleInstalled.map((item) => {
              const enabled = !!item.enabledFor[agentApp]
              return (
                <div
                  key={item.slug}
                  onClick={() => setSelectedSlug(item.slug)}
                  className={`cursor-pointer rounded-lg border px-3 py-2 ${
                    selectedSlug === item.slug ? 'border-store-accent bg-store-accent-soft' : 'border-store-border bg-store-panel'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-store-text">{item.name}</p>
                      <p className="text-xs text-store-text-3">
                        {item.publisher.name} · {item.category}
                      </p>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label={`为 ${agentApp} ${enabled ? '禁用' : '启用'} ${item.slug}`}
                        onClick={() => toggleEnabled(item)}
                        className={`rounded-md px-2 py-1 text-xs ${
                          enabled ? 'bg-store-green/10 text-store-green' : 'bg-store-panel-2 text-store-text-2'
                        }`}
                      >
                        {enabled ? '已启用' : '已禁用'}
                      </button>
                      {item.category === 'provider' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingSlug(item.slug)}
                            className="text-xs text-store-text-2 hover:text-store-text"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateProvider(item)}
                            className="text-xs text-store-text-2 hover:text-store-text"
                          >
                            复制
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => uninstall(item)}
                        className="text-xs text-store-red hover:opacity-80"
                      >
                        卸载
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {navView === 'browse' && showRecommendedSection(listFilter) && (
        <div>
          <p className="mb-2 text-xs font-medium text-store-text-2">
            推荐 <span className="rounded-full bg-store-panel-2 px-1.5">{visibleRecommended.length}</span>
          </p>
          <div className="flex flex-col gap-1">
            {visibleRecommended.map((item) => (
              <div
                key={item.slug}
                onClick={() => setSelectedSlug(item.slug)}
                className={`cursor-pointer rounded-lg border px-3 py-2 ${
                  selectedSlug === item.slug ? 'border-store-accent bg-store-accent-soft' : 'border-store-border bg-store-panel'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-store-text">{item.name}</p>
                    <p className="text-xs text-store-text-3">
                      ★ {item.rating} · ↓ {item.downloads}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      install(item)
                    }}
                    className="rounded-md bg-store-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    安装
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {navView === 'updates' && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-medium text-store-text-2">
              更新 <span className="rounded-full bg-store-panel-2 px-1.5">{updates.length}</span>
            </p>
            {updates.length > 0 && (
              <button
                type="button"
                onClick={updateAll}
                className="rounded-md bg-store-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                全部更新
              </button>
            )}
          </div>
          {updates.length === 0 ? (
            <p className="text-sm text-store-text-2">所有包均为最新</p>
          ) : (
            <div className="flex flex-col gap-1">
              {updates.map((item) => (
                <div
                  key={item.slug}
                  className="rounded-lg border border-store-border bg-store-panel px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-store-text">
                      {item.slug} v{item.currentVersion} → v{item.latestVersion}
                    </p>
                    <button
                      type="button"
                      onClick={() => updateOne(item.slug)}
                      className="rounded-md bg-store-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                    >
                      更新
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editingSlug && (
        <ProviderEditModal slug={editingSlug} open onOpenChange={(open) => { if (!open) setEditingSlug(null) }} />
      )}
    </div>
  )
}
