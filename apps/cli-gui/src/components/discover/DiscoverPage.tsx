import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Heart, Search } from 'lucide-react'
import { resourceSlug, type CatalogResource, type CatalogSearchResult, type InstalledItem, type ResourceSort, type UpdateAvailable } from '@as/types'
import { callRpc, errorText } from '../../lib/rpc'
import { formatInstalls, installedEntryFor, pinLocalFirst } from '../../lib/catalog'
import { useAppState, type DiscoverKind } from '../../state/AppState'
import { useAuth } from '../../state/Auth'
import { useFavorites, type FavoriteItem } from '../../state/Favorites'
import { useTerminalLog } from '../../state/TerminalLog'
import { useT } from '../../i18n'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { InputWithIcon, Select } from '../ui/input'
import { Segmented } from '../ui/segmented'
import { Banner, EmptyState, LoadingRows } from '../ui/states'
import { ListBox, ListRow, PageWithPane, ViewHeader } from '../library/parts'
import { useUpdater } from '../library/common'
import { CatalogPane } from './CatalogPane'
import { useProjects } from '../../state/Projects'
import { useOpenProject } from '../../lib/useNavigate'

const PAGE = 50
const SEARCH_DEBOUNCE_MS = 250

/** `featured` is the verified rows of the default order; the others are server-side sorts. */
export type DiscoverSort = 'default' | 'featured' | 'installs' | 'updated'

const SORTS: DiscoverSort[] = ['default', 'featured', 'installs', 'updated']

function serverSort(sort: DiscoverSort): ResourceSort {
  return sort === 'installs' ? 'installs' : sort === 'updated' ? 'updated' : 'default'
}

/** The kind a favorite's id implies, for an entry the catalog no longer has. */
function kindOfId(id: string): CatalogResource['kind'] {
  return id.startsWith('builtin:') ? 'provider' : id.startsWith('github:') ? 'skill' : 'mcp'
}

function favoriteRow(f: FavoriteItem): CatalogResource | null {
  return f.resource ? { ...f.resource, slug: resourceSlug(f.resource) } : null
}

function matches(f: FavoriteItem, kind: DiscoverKind, q: string): boolean {
  const k = f.resource?.kind ?? kindOfId(f.id)
  if (kind !== 'all' && k !== kind) return false
  if (!q) return true
  const hay = `${f.id} ${f.resource?.name ?? ''} ${f.resource?.description ?? ''} ${f.resource?.author?.name ?? ''}`.toLowerCase()
  return hay.includes(q.toLowerCase())
}

export function useInstalledIndex() {
  const { installedVersion } = useAppState()
  const [installed, setInstalled] = useState<InstalledItem[]>([])
  const [updates, setUpdates] = useState<UpdateAvailable[]>([])
  useEffect(() => {
    callRpc<InstalledItem[]>('list').then(setInstalled, () => undefined)
    callRpc<UpdateAvailable[]>('checkUpdates').then(setUpdates, () => undefined)
  }, [installedVersion])
  return { installed, updates }
}

/** 发现: the catalog, searched and filtered on the server, with the selected entry in the pane. */
export function DiscoverPage() {
  const t = useT()
  const {
    selectedSlug, setSelectedSlug, setNavView, setCategoryFilter, setCatalogOffline,
    searchSeed, setSearchSeed, discoverKind, setDiscoverKind, requestInstall, installInto, setInstallInto,
    discoverFavorites, setDiscoverFavorites,
  } = useAppState()
  const { signedIn } = useAuth()
  const favorites = useFavorites()
  const { projects } = useProjects()
  const openProject = useOpenProject()
  const into = projects.find((p) => p.id === installInto && p.exists)
  const { appendLine } = useTerminalLog()
  const { installed, updates } = useInstalledIndex()
  const updater = useUpdater()
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<DiscoverSort>('default')
  const [rows, setRows] = useState<CatalogResource[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    if (searchSeed === null) return
    setText(searchSeed)
    setQuery(searchSeed.trim())
    setSearchSeed(null)
  }, [searchSeed, setSearchSeed])

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text])

  const kind = discoverKind === 'all' ? undefined : discoverKind

  async function load(offset = 0) {
    const mine = ++seq.current
    if (!offset) setLoading(true)
    try {
      const result = await callRpc<CatalogSearchResult>('search', [
        query,
        { ...(kind ? { category: kind } : {}), sort: serverSort(sort), limit: PAGE, ...(offset ? { offset } : {}) },
      ])
      if (seq.current !== mine) return
      setRows((prev) => (offset ? [...prev, ...result.resources] : result.resources))
      setNextOffset(result.offline ? null : result.nextOffset)
      setOffline(result.offline)
      setCatalogOffline(result.offline)
      setError(null)
    } catch (err) {
      if (seq.current !== mine) return
      appendLine(`✗ ${errorText(err)}`, 'red')
      if (!offset) setRows([])
      setNextOffset(null)
      setError(errorText(err))
      setCatalogOffline(true)
    } finally {
      if (seq.current === mine) setLoading(false)
    }
  }

  useEffect(() => {
    if (discoverFavorites) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, kind, sort, nonce, discoverFavorites])

  const favItems = useMemo(
    () => (discoverFavorites ? favorites.items.filter((f) => matches(f, discoverKind, query)) : []),
    [discoverFavorites, favorites.items, discoverKind, query]
  )

  const updatable = useMemo(() => new Set(updates.map((u) => u.slug)), [updates])
  const visible = useMemo(() => pinLocalFirst(rows.filter((r) => sort !== 'featured' || r.verified)), [rows, sort])

  function manage(slug: string, category: InstalledItem['category']) {
    setCategoryFilter(category)
    setNavView('browse')
    setSelectedSlug(slug)
  }

  function clear() {
    setText('')
    setQuery('')
    setDiscoverKind('all')
    setSort('default')
  }

  function favoriteList() {
    if (favorites.loading && favorites.items.length === 0) return <LoadingRows rows={4} label={t('disc.loading')} />
    if (favorites.items.length === 0) return <EmptyState kind="skill" title={t('fav.emptyT')} body={t('fav.emptyD')} />
    if (favItems.length === 0) {
      return (
        <EmptyState
          title={t('fav.noMatchT')}
          action={
            <Button size="sm" onClick={clear}>
              {t('disc.clear')}
            </Button>
          }
        />
      )
    }
    return (
      <ListBox>
        {favItems.map((f) => {
          const r = favoriteRow(f)
          if (!r) {
            return (
              <ListRow
                key={f.id}
                kind={kindOfId(f.id)}
                selected={false}
                onOpen={() => setSelectedSlug(f.id)}
                title={f.id}
                sub={t('fav.gone')}
                dim
                right={
                  <Button size="sm" onClick={() => favorites.toggle(f.id, null)}>
                    {t('fav.off')}
                  </Button>
                }
              />
            )
          }
          return rowOf(r)
        })}
      </ListBox>
    )
  }

  function action(r: CatalogResource) {
    const entry = installedEntryFor(r, installed)
    if (into && r.kind !== 'provider') {
      return (
        <Button size="sm" variant="kind" onClick={() => requestInstall(r.id)}>
          {t('act.install')}
        </Button>
      )
    }
    if (r.kind === 'provider') {
      return (
        <Button size="sm" variant="kind" onClick={() => requestInstall(r.id)}>
          {t(entry ? 'act.addCfg' : 'act.install')}
        </Button>
      )
    }
    if (entry && updatable.has(entry.slug)) {
      return (
        <Button size="sm" variant="kind" disabled={updater.busy} onClick={() => void updater.update([entry.slug])}>
          {t('act.update')}
        </Button>
      )
    }
    if (entry) {
      return (
        <Button size="sm" onClick={() => manage(entry.slug, entry.category)}>
          {t('act.manage')}
        </Button>
      )
    }
    return (
      <Button size="sm" variant="kind" onClick={() => requestInstall(r.id)}>
        {t('act.install')}
      </Button>
    )
  }

  function rowOf(r: CatalogResource) {
    const entry = installedEntryFor(r, installed)
    const meta = r.installs != null ? `↓ ${formatInstalls(r.installs)}` : r.stars != null ? `★ ${formatInstalls(r.stars)}` : ''
    return (
      <ListRow
        key={r.id}
        kind={r.kind}
        selected={selectedSlug === r.id}
        onOpen={() => setSelectedSlug(r.id)}
        title={r.name}
        chips={
          <>
            {entry && r.kind !== 'provider' && (
              <Badge tone="ok">
                <Check />
                {t('st.installed')}
              </Badge>
            )}
            {entry && updatable.has(entry.slug) && <Badge tone="warn">{t('st.update')}</Badge>}
          </>
        }
        sub={`${r.author?.name ?? t('disc.unknownAuthor')} · ${r.description ?? ''}`}
        right={
          <>
            <span title={r.installs != null ? t('f.installs') : t('f.stars')} className="min-w-16 whitespace-nowrap text-right font-mono text-[11.5px] font-medium text-fg-3">
              {meta}
            </span>
            {action(r)}
          </>
        }
      />
    )
  }

  let list
  if (discoverFavorites) list = favoriteList()
  else if (loading && rows.length === 0) list = <LoadingRows rows={7} label={t('disc.loading')} />
  else if (!error && visible.length === 0) {
    list = (
      <EmptyState
        kind={kind ?? 'mcp'}
        title={t('disc.emptyT')}
        body={t('disc.emptyD')}
        action={
          <Button size="sm" onClick={clear}>
            {t('disc.clear')}
          </Button>
        }
      />
    )
  } else if (visible.length > 0) {
    list = (
      <>
        <div aria-busy={loading || undefined} className={loading ? 'opacity-60 transition-opacity' : undefined}>
          <ListBox>
            {visible.map((r) => rowOf(r))}
          </ListBox>
        </div>
        {nextOffset !== null && (
          <div className="flex justify-center pt-3">
            <Button size="sm" onClick={() => void load(nextOffset)}>
              {t('disc.more')}
            </Button>
          </div>
        )}
      </>
    )
  }

  const view = (
    <>
      <ViewHeader title={t('disc.title')} sub={t('disc.sub')} />
      {into && (
        <div className="mb-3">
          <Banner
            tone="info"
            title={t('pj.into.title').replace('{0}', into.name)}
            actions={
              <>
                <Button size="sm" onClick={() => openProject(into.id)}>
                  {t('pj.into.back')}
                </Button>
                <Button size="sm" onClick={() => setInstallInto(null)}>
                  {t('pj.into.clear')}
                </Button>
              </>
            }
          >
            <p>{t('pj.into.sub')}</p>
          </Banner>
        </div>
      )}
      {discoverFavorites && !signedIn && (
        <div className="mb-3">
          <Banner tone="info">
            <p>{t('fav.local')}</p>
          </Banner>
        </div>
      )}
      {discoverFavorites && (favorites.unsynced > 0 || favorites.syncError) && (
        <div className="mb-3">
          <Banner tone="warn" actions={<Button size="sm" onClick={favorites.retry}>{t('fav.retry')}</Button>}>
            <p>{t('fav.pending').replace('{0}', String(favorites.unsynced))}</p>
          </Banner>
        </div>
      )}
      {!discoverFavorites && offline && (
        <div className="mb-3">
          <Banner tone="warn" title={t('disc.offT')} actions={<Button size="sm" onClick={() => setNonce((n) => n + 1)}>{t('ui.retry')}</Button>}>
            <p>{t('disc.offD')}</p>
          </Banner>
        </div>
      )}
      {!discoverFavorites && error && (
        <div className="mb-3">
          <Banner tone="error" title={t('disc.errT')} actions={<Button size="sm" onClick={() => setNonce((n) => n + 1)}>{t('ui.retry')}</Button>}>
            <p>{t('disc.errD')}</p>
          </Banner>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <InputWithIcon
          icon={<Search />}
          type="search"
          data-page-search
          autoComplete="off"
          spellCheck={false}
          placeholder={t('disc.ph')}
          aria-label={t('disc.ph')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && text) {
              e.stopPropagation()
              setText('')
            }
          }}
        />
        <Segmented<DiscoverKind>
          label={t('disc.kind')}
          value={discoverKind}
          onChange={setDiscoverKind}
          options={[
            { value: 'all', label: t('disc.all') },
            { value: 'skill', label: t('categories.skill'), kind: 'skill' },
            { value: 'mcp', label: 'MCP', kind: 'mcp' },
            { value: 'provider', label: t('categories.provider'), kind: 'provider' },
          ]}
        />
        <Button
          aria-pressed={discoverFavorites}
          onClick={() => setDiscoverFavorites(!discoverFavorites)}
          className={discoverFavorites ? 'bg-white/[0.12] text-fg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : undefined}
        >
          <Heart fill={discoverFavorites ? 'currentColor' : 'none'} />
          {t('fav.filter')}
          {favorites.items.length > 0 && <span className="font-mono text-[11.5px] text-fg-3">{favorites.items.length}</span>}
        </Button>
        {!discoverFavorites && (
          <Select fit aria-label={t('disc.sortLabel')} value={sort} onChange={(e) => setSort(e.target.value as DiscoverSort)}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`disc.sort.${s}`)}
              </option>
            ))}
          </Select>
        )}
      </div>
      <p className="px-3 pb-1.5 text-[11.5px] text-fg-3">
        {discoverFavorites ? t('fav.heading') : query ? t('disc.results').replace('{0}', query) : t(`disc.heading.${sort}`)}
      </p>
      {list}
    </>
  )

  const selectedRow = discoverFavorites ? favorites.items.find((f) => f.id === selectedSlug)?.resource : rows.find((r) => r.id === selectedSlug)
  const paneId = selectedSlug && selectedSlug.includes(':') ? selectedSlug : null

  return (
    <PageWithPane
      view={view}
      pane={
        paneId ? (
          <CatalogPane
            key={paneId}
            id={paneId}
            kind={selectedRow?.kind}
            installed={installed}
            updatable={updatable}
            updating={updater.busy}
            onUpdate={(slug) => void updater.update([slug])}
            onManage={manage}
            into={into}
            onClose={() => setSelectedSlug(null)}
          />
        ) : null
      }
    />
  )
}
