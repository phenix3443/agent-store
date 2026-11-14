import { useEffect, useState, type ReactNode } from 'react'
import { Check, ExternalLink, Heart } from 'lucide-react'
import type { CatalogResourceDetail, InstalledItem, Project } from '@as/types'
import { callRpc, errorText } from '../../lib/rpc'
import { formatInstalls, formatVersion, installedEntryFor, resourceItem, storePageUrl } from '../../lib/catalog'
import { installStepsOf, requiredKeys, typeFacts, type SelectedDetail } from '../../lib/detailContent'
import { AGENTS, joinNames } from '../../lib/agents'
import { openExternal } from '../../lib/openExternal'
import { useAppState } from '../../state/AppState'
import { useFavorites } from '../../state/Favorites'
import { useI18n } from '../../i18n'
import { Badge, KindLabel } from '../ui/badge'
import { Button } from '../ui/button'
import { Banner, Skeleton } from '../ui/states'
import { toast } from '../ui/toast'
import { CodeLine, DetailPane, ErrorDetails, Facts, PaneHead, Section, Steps } from '../library/parts'
import { transportLong, transportText } from '../library/McpPane'

type Kind = InstalledItem['category']

/** The catalog entry behind a Discover row: what it is, what installing writes, and how to install it. */
export function CatalogPane({
  id,
  kind,
  installed,
  updatable,
  updating,
  onUpdate,
  onManage,
  into,
  onClose,
}: {
  id: string
  kind?: Kind
  installed: InstalledItem[]
  updatable: Set<string>
  updating: boolean
  onUpdate: (slug: string) => void
  onManage: (slug: string, category: Kind) => void
  /** Discover was opened from this project's page: installing defaults to it. */
  into?: Pick<Project, 'id' | 'name'>
  onClose: () => void
}) {
  const { locale, t } = useI18n()
  const { requestInstall } = useAppState()
  const favorites = useFavorites()
  const [resource, setResource] = useState<CatalogResourceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setResource(null)
    setError(null)
    callRpc<CatalogResourceDetail>('getResource', [id]).then(
      (r) => !cancelled && setResource(r),
      (err) => !cancelled && setError(errorText(err))
    )
    return () => {
      cancelled = true
    }
  }, [id])

  const paneKind: Kind = resource?.kind ?? kind ?? 'mcp'

  if (!resource) {
    return (
      <DetailPane label={id} kind={paneKind} onClose={onClose}>
        {error ? (
          <Banner tone="error" title={t('disc.paneErr')}>
            <ErrorDetails detail={error} />
          </Banner>
        ) : (
          <div role="status" aria-label={t('ui.loading')}>
            <div className="flex items-start gap-3.5">
              <Skeleton className="h-12 w-12 rounded-[13px]" />
              <div className="flex-1">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="mt-4 h-3" />
            <Skeleton className="mt-2 h-3 w-4/5" />
          </div>
        )}
      </DetailPane>
    )
  }

  const item = resourceItem(resource)
  const detail: SelectedDetail = { ...item, installed: false, resource }
  const entry = installedEntryFor(resource, installed)
  const fav = favorites.isFavorite(resource.id)
  const notInstallable = resource.installError
  const mcp = item.category === 'mcp' ? item : null
  const needs = requiredKeys(detail)
  const works = AGENTS.filter((a) => item.compatibleWith.includes(a.id)).map((a) => a.name)
  const when = resource.origin.upstreamUpdatedAt ?? resource.origin.syncedAt

  let actions
  if (into && resource.kind !== 'provider') {
    actions = (
      <>
        <Button variant="primary" disabled={!!notInstallable} title={notInstallable} onClick={() => requestInstall(resource.id)}>
          {notInstallable ? t('catalog.notInstallable') : t('pj.into.install').replace('{0}', into.name)}
        </Button>
        {entry && <Button onClick={() => onManage(entry.slug, entry.category)}>{t('act.manage')}</Button>}
      </>
    )
  } else if (resource.kind === 'provider') {
    actions = (
      <>
        <Button variant="primary" onClick={() => requestInstall(resource.id)}>
          {t(entry ? 'act.addCfg' : 'act.install')}
        </Button>
        {entry && <Button onClick={() => onManage(entry.slug, entry.category)}>{t('act.manage')}</Button>}
      </>
    )
  } else if (entry) {
    actions = (
      <>
        <Badge tone="ok">
          <Check />
          {t('st.installed')}
        </Badge>
        <Button onClick={() => onManage(entry.slug, entry.category)}>{t('act.manage')}</Button>
        {updatable.has(entry.slug) && (
          <Button variant="kind" disabled={updating} onClick={() => onUpdate(entry.slug)}>
            {t('act.update')}
          </Button>
        )}
      </>
    )
  } else {
    actions = (
      <Button variant="primary" disabled={!!notInstallable} title={notInstallable} onClick={() => requestInstall(resource.id)}>
        {notInstallable ? t('catalog.notInstallable') : t('act.install')}
      </Button>
    )
  }

  const facts: [string, ReactNode][] = [[t('f.kind'), <KindLabel key="k" kind={item.category}>{t(`categories.${item.category}`)}</KindLabel>]]
  if (mcp) {
    facts.push([
      t('f.transport'),
      <span key="tr">
        {transportLong(mcp, t)}
        <code className="mt-0.5 block break-all font-mono text-[11.5px] text-fg-2">{transportText(mcp)}</code>
      </span>,
    ])
  }
  if (needs.length) facts.push([t('f.needs'), <code key="n" className="font-mono text-[11.5px]">{needs.join(', ')}</code>])
  facts.push([
    t('f.agents'),
    <span key="a">
      {joinNames(works, locale)}
      {mcp?.transport === 'sse' && <span className="block text-fg-3">{t('errors.codexSse')}</span>}
    </span>,
  ])
  facts.push([t('f.version'), <span key="v" className="font-mono text-xs">{formatVersion(resource.version)}</span>])
  if (when) facts.push([t('f.updated'), new Date(when).toLocaleDateString()])
  if (resource.installs != null) facts.push([t('f.installs'), formatInstalls(resource.installs)])
  if (resource.stars != null) facts.push([t('f.stars'), formatInstalls(resource.stars)])
  const source = resource.kind === 'skill' ? resource.repo.url : resource.homepageUrl
  facts.push([
    t('f.source'),
    source ? (
      <button key="s" type="button" onClick={() => void openExternal(source)} className="break-all text-left text-fg-2 underline-offset-2 hover:text-fg hover:underline">
        {source.replace(/^https?:\/\//, '')}
      </button>
    ) : (
      t(`catalog.source.${resource.origin.site}`)
    ),
  ])

  return (
    <DetailPane label={resource.id} kind={item.category} onClose={onClose}>
      <PaneHead kind={item.category} title={resource.name} by={resource.author?.name ?? t('disc.unknownAuthor')} />
      {resource.description && <p className="mt-3 line-clamp-5 text-fg-2">{resource.description}</p>}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {actions}
        <Button
          icon
          aria-pressed={fav}
          aria-label={t(fav ? 'act.favOff' : 'act.favOn')}
          title={t(fav ? 'act.favOff' : 'act.favOn')}
          onClick={() => toast(t(favorites.toggle(resource.id, resource) ? 'fav.added' : 'fav.removed'))}
          className={fav ? 'bg-panel-2 text-fg' : undefined}
        >
          <Heart fill={fav ? 'currentColor' : 'none'} />
        </Button>
        <Button icon aria-label={t('act.storePage')} title={t('act.storePage')} onClick={() => void openExternal(storePageUrl(resource.kind, resource.id))}>
          <ExternalLink />
        </Button>
      </div>
      {notInstallable && (
        <div className="mt-3">
          <Banner tone="info" title={t('catalog.notInstallable')}>
            <p>{t('errors.notInstallable')}</p>
            <ErrorDetails detail={notInstallable} />
          </Banner>
        </div>
      )}

      <Section title={t('sec.facts')}>
        <Facts rows={facts} />
      </Section>
      {!notInstallable && (
        <Section title={t('sec.writes')}>
          <Steps lines={[...installStepsOf(detail, t), ...typeFacts(detail, t)]} />
        </Section>
      )}
      <Section title={t('sec.cli')}>
        <CodeLine prompt text={`aas install ${resource.id}`} />
      </Section>
    </DetailPane>
  )
}
