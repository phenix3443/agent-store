import { useMemo, useState } from 'react'
import { Plus, RefreshCw, Search } from 'lucide-react'
import { useInstalled, type InstalledRow } from '../../lib/useInstalled'
import { AGENTS } from '../../lib/agents'
import { formatVersion } from '../../lib/catalog'
import { useAppState } from '../../state/AppState'
import { useT } from '../../i18n'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { InputWithIcon } from '../ui/input'
import { Segmented } from '../ui/segmented'
import { Banner, EmptyState, LoadingRows } from '../ui/states'
import { AgentColumns, AgentSwitch, ListBox, ListRow, PageWithPane, ViewHeader } from './parts'
import { blockerText, transportShort, transportText } from './McpPane'
import { McpPane } from './McpPane'
import { SkillPane } from './SkillPane'
import { useUpdater } from './common'
import { useTargetToggle } from './useTargetToggle'
import { useUninstall } from './UninstallDialog'

type LibKind = 'skill' | 'mcp'
type Filter = 'all' | 'on' | 'off' | 'upd'

function matches(row: InstalledRow, q: string, f: Filter): boolean {
  if (q && !`${row.name} ${row.slug}`.toLowerCase().includes(q.toLowerCase())) return false
  const any = AGENTS.some((a) => row.enabledFor[a.id])
  return f === 'all' || (f === 'on' && any) || (f === 'off' && !any) || (f === 'upd' && !!row.update)
}

/** 技能 / MCP: what is installed on this machine, one switch per agent. */
export function LibraryPage({ kind }: { kind: LibKind }) {
  const t = useT()
  const { selectedSlug, setSelectedSlug, setNavView, setCategoryFilter, setDiscoverKind } = useAppState()
  const { rows, loading, error, reload } = useInstalled(kind)
  const toggle = useTargetToggle()
  const updater = useUpdater()
  const uninstall = useUninstall((slug) => {
    if (selectedSlug === slug) setSelectedSlug(null)
  })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const updatable = rows.filter((r) => r.update)
  const visible = useMemo(() => rows.filter((r) => matches(r, query.trim(), filter)), [rows, query, filter])
  const selected = rows.find((r) => r.slug === selectedSlug) ?? null

  function browse() {
    setDiscoverKind(kind)
    setSelectedSlug(null)
    setCategoryFilter('all')
    setNavView('browse')
  }

  async function onToggle(row: InstalledRow, target: InstalledRow['compatibleWith'][number], on: boolean) {
    const failed = await toggle.toggle(row.slug, target, on)
    if (failed) setSelectedSlug(row.slug)
  }

  const header = (
    <ViewHeader
      title={t(`lib.${kind}Title`)}
      sub={t(`lib.${kind}Sub`)}
      actions={
        <>
          <Button size="sm" disabled={updater.busy} onClick={() => void updater.check()}>
            <RefreshCw />
            {t('lib.check')}
          </Button>
          {updatable.length > 0 && (
            <Button size="sm" variant="kind" data-kind={kind} disabled={updater.busy} onClick={() => void updater.update(updatable.map((r) => r.slug))}>
              {t('lib.updateAll').replace('{0}', String(updatable.length))}
            </Button>
          )}
          <Button size="sm" onClick={browse}>
            <Plus />
            {t('lib.add')}
          </Button>
        </>
      }
    />
  )

  let body
  if (loading && rows.length === 0) body = <LoadingRows rows={5} label={t('ui.loading')} />
  else if (error && rows.length === 0) {
    body = (
      <Banner tone="error" title={t('lib.loadFailed')} actions={<Button size="sm" onClick={reload}>{t('ui.retry')}</Button>}>
        <p>{error}</p>
      </Banner>
    )
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        kind={kind}
        title={t(`lib.${kind}EmptyT`)}
        body={t(`lib.${kind}EmptyD`)}
        action={
          <Button variant="primary" onClick={browse}>
            {t(`lib.browse${kind === 'skill' ? 'Skill' : 'Mcp'}`)}
          </Button>
        }
      />
    )
  } else {
    body = (
      <>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <InputWithIcon
            icon={<Search />}
            type="search"
            data-page-search
            autoComplete="off"
            spellCheck={false}
            placeholder={t('lib.ph')}
            aria-label={t('lib.ph')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Segmented<Filter>
            label={t('lib.filter')}
            value={filter}
            onChange={setFilter}
            options={(['all', 'on', 'off', 'upd'] as const).map((f) => ({
              value: f,
              label: (
                <>
                  {t(`lib.f.${f}`)}
                  {f === 'upd' && updatable.length > 0 && <small className="font-mono text-[10.5px] font-medium text-fg-3">{updatable.length}</small>}
                </>
              ),
            }))}
          />
        </div>
        <AgentColumns label={t('lib.count').replace('{0}', String(visible.length)).replace('{1}', String(rows.length))} />
        {visible.length === 0 ? (
          <EmptyState
            kind={kind}
            title={t('lib.noMatchT')}
            body={t('lib.noMatchD')}
            action={
              <Button
                size="sm"
                onClick={() => {
                  setQuery('')
                  setFilter('all')
                }}
              >
                {t('disc.clear')}
              </Button>
            }
          />
        ) : (
          <ListBox>
            {visible.map((row) => {
              const needsCfg = kind === 'mcp' && !!row.status?.some((s) => s.compatible && s.blocker?.reason === 'needs-config')
              const anyOn = AGENTS.some((a) => row.enabledFor[a.id])
              return (
                <ListRow
                  key={row.slug}
                  kind={kind}
                  selected={row.slug === selectedSlug}
                  onOpen={() => setSelectedSlug(row.slug)}
                  title={row.name}
                  chips={
                    <>
                      {kind === 'mcp' && <Badge title={transportText(row)}>{transportShort(row, t)}</Badge>}
                      {row.update && <Badge tone="warn">{t('st.update')}</Badge>}
                      {needsCfg && <Badge tone="warn">{t('st.needsCfg')}</Badge>}
                      {!anyOn && <Badge>{t('st.off')}</Badge>}
                    </>
                  }
                  sub={kind === 'skill' ? `~/.agent-store/skills/${row.slug}` : transportText(row)}
                  subMono
                  right={
                    <>
                      {AGENTS.map((agent) => {
                        const on = !!row.enabledFor[agent.id]
                        const status = row.status?.find((s) => s.target === agent.id)
                        const reason =
                          kind === 'mcp'
                            ? blockerText(status, agent.name, t)
                            : row.compatibleWith.includes(agent.id)
                              ? undefined
                              : t('errors.incompatible').replace('{tool}', agent.name)
                        return (
                          <span key={agent.id} className="flex w-[78px] flex-none justify-center max-[1040px]:w-[64px]">
                            <AgentSwitch
                              kind={kind}
                              agent={agent}
                              itemName={row.name}
                              checked={on}
                              reason={reason}
                              busy={toggle.busy === `${row.slug}:${agent.id}`}
                              onToggle={() => void onToggle(row, agent.id, on)}
                            />
                          </span>
                        )
                      })}
                      <span className="flex w-[112px] flex-none justify-end">
                        {row.update ? (
                          <Button size="sm" variant="kind" disabled={updater.busy} onClick={() => void updater.update([row.slug])}>
                            {t('act.update')}
                          </Button>
                        ) : (
                          <span className="min-w-16 truncate text-right font-mono text-[11.5px] font-medium text-fg-3">{formatVersion(row.version)}</span>
                        )}
                      </span>
                    </>
                  }
                />
              )
            })}
          </ListBox>
        )}
      </>
    )
  }

  const paneProps = selected && {
    row: selected,
    toggle,
    onClose: () => setSelectedSlug(null),
    onUninstall: () => uninstall.ask({ slug: selected.slug, category: selected.category, enabledFor: selected.enabledFor, name: selected.name }),
    onUpdate: () => void updater.update([selected.slug]),
    updating: updater.busy,
  }

  return (
    <>
      <PageWithPane
        view={
          <>
            {header}
            {body}
          </>
        }
        pane={paneProps ? kind === 'skill' ? <SkillPane {...paneProps} /> : <McpPane key={paneProps.row.slug} {...paneProps} /> : null}
      />
      {uninstall.dialog}
    </>
  )
}
