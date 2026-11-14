import { useEffect, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import type { InstalledItem, RelayStatus, UpdateAvailable } from '@as/types'
import { useAppState } from '../../state/AppState'
import { useT } from '../../i18n'
import { callRpc } from '../../lib/rpc'
import { relayState } from '../../lib/relay'
import { currentSection, SECTIONS, type Section } from '../../lib/nav'
import { useNavigate, useOpenProject } from '../../lib/useNavigate'
import { useProjects } from '../../state/Projects'
import { NARROW_QUERY, useMediaQuery } from '../../lib/useMediaQuery'
import { Glyph } from '../ui/icons'
import { Tooltip } from '../ui/tooltip'
import { cn } from '../ui/cn'
import { AccountMenu } from './AccountMenu'

type Kind = 'skill' | 'mcp' | 'provider'

function NavItem({
  section,
  current,
  narrow,
  count,
  dot,
}: {
  section: (typeof SECTIONS)[number]
  current: boolean
  narrow: boolean
  count?: number
  dot?: boolean
}) {
  const t = useT()
  const navigate = useNavigate()
  const label = t(`nav.${section.id}`)
  return (
    <Tooltip label={label} disabled={!narrow}>
      <button
        type="button"
        data-kind={section.kind}
        aria-current={current ? 'page' : undefined}
        onClick={() => navigate(section.id)}
        className={cn(
          'relative flex h-[34px] w-full flex-none items-center gap-2.5 whitespace-nowrap rounded-[9px] px-2.5 font-medium transition-colors',
          'max-[1040px]:justify-center max-[1040px]:px-0',
          current ? 'bg-panel-2 text-fg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]' : 'text-fg-2 hover:bg-panel hover:text-fg'
        )}
      >
        <Glyph name={section.icon} className={cn('h-[17px] w-[17px] flex-none', current && section.kind && 'as-glow text-kind')} />
        <span className="truncate max-[1040px]:sr-only">{label}</span>
        {count !== undefined && <span className="ml-auto font-mono text-[11px] font-medium text-fg-3 max-[1040px]:hidden">{count}</span>}
        {dot && (
          <span
            title={t('shell.updateAvailable')}
            className={cn(
              'h-[7px] w-[7px] rounded-full bg-warn shadow-[0_0_8px_rgb(var(--warn-rgb)/0.8)]',
              count !== undefined ? 'ml-1.5' : 'ml-auto',
              'max-[1040px]:absolute max-[1040px]:right-2 max-[1040px]:top-1.5 max-[1040px]:m-0'
            )}
          >
            <span className="sr-only">{t('shell.updateAvailable')}</span>
          </span>
        )}
      </button>
    </Tooltip>
  )
}

const KIND_OF: Partial<Record<Section, Kind>> = { skills: 'skill', mcp: 'mcp', providers: 'provider' }

const ROW =
  'relative flex h-[34px] w-full flex-none items-center gap-2.5 whitespace-nowrap rounded-[9px] px-2.5 font-medium transition-colors'
const rowState = (current: boolean) =>
  current ? 'bg-panel-2 text-fg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]' : 'text-fg-2 hover:bg-panel hover:text-fg'

/** 项目: one row per registered project and 添加项目; a narrow window keeps one icon that opens the list. */
function ProjectsGroup({ narrow }: { narrow: boolean }) {
  const t = useT()
  const { navView, projectId } = useAppState()
  const { projects, summaries, openDialog } = useProjects()
  const openProject = useOpenProject()
  const onProjects = navView === 'projects' || navView === 'project'
  const anyMissing = projects.some((p) => !p.exists)

  if (narrow) {
    return (
      <Tooltip label={t('nav.projects')}>
        <button
          type="button"
          aria-current={onProjects ? 'page' : undefined}
          onClick={() => openProject(null)}
          className={cn(ROW, 'justify-center px-0', rowState(onProjects))}
        >
          <Glyph name="folder" className="h-[17px] w-[17px] flex-none" />
          <span className="sr-only">{t('nav.projects')}</span>
          {anyMissing && (
            <span className="absolute right-2 top-1.5 h-[7px] w-[7px] rounded-full bg-warn">
              <span className="sr-only">{t('pj.missingChip')}</span>
            </span>
          )}
        </button>
      </Tooltip>
    )
  }

  return (
    <>
      <button
        type="button"
        aria-current={navView === 'projects' ? 'page' : undefined}
        onClick={() => openProject(null)}
        className="flex-none rounded-md px-2.5 pb-1.5 pt-3 text-left font-mono text-[11px] font-medium leading-none text-fg-3 hover:text-fg-2"
      >
        {t('nav.projects')}
      </button>
      <div className="-mx-1 flex min-h-0 shrink flex-col gap-0.5 overflow-y-auto px-1">
        {projects.map((p) => {
          const current = navView === 'project' && projectId === p.id
          const sum = summaries[p.id]
          const n = sum && sum.skills !== null && sum.mcps !== null ? sum.skills + sum.mcps : null
          return (
            <button
              key={p.id}
              type="button"
              title={p.path}
              aria-current={current ? 'page' : undefined}
              onClick={() => openProject(p.id)}
              className={cn(ROW, rowState(current))}
            >
              <Glyph name="folder" className="h-[17px] w-[17px] flex-none" />
              <span className="min-w-0 truncate">{p.name}</span>
              {p.exists && n !== null && (
                <span className="ml-auto font-mono text-[11px] font-medium text-fg-3">
                  <span aria-hidden>{n}</span>
                  <span className="sr-only">{t('pjx.count').replace('{0}', String(n))}</span>
                </span>
              )}
              {!p.exists && (
                <span className="ml-auto flex-none text-warn" title={t('pj.missingChip')}>
                  <AlertTriangle size={13} aria-hidden />
                  <span className="sr-only">{t('pj.missingChip')}</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
      <button type="button" onClick={() => openDialog({ kind: 'add' })} className={cn(ROW, 'text-fg-3 hover:bg-panel hover:text-fg')}>
        <Plus size={17} className="flex-none" />
        <span>{t('pj.add')}</span>
      </button>
    </>
  )
}

export function Sidebar() {
  const t = useT()
  const { navView, categoryFilter, installedVersion } = useAppState()
  const navigate = useNavigate()
  const narrow = useMediaQuery(NARROW_QUERY)
  const [installed, setInstalled] = useState<InstalledItem[]>([])
  const [updates, setUpdates] = useState<UpdateAvailable[]>([])
  const [relay, setRelay] = useState<RelayStatus | null>(null)
  const current = currentSection(navView, categoryFilter)

  useEffect(() => {
    callRpc<InstalledItem[]>('list').then(setInstalled, () => undefined)
    callRpc<UpdateAvailable[]>('checkUpdates').then(setUpdates, () => undefined)
    callRpc<RelayStatus>('getRelayStatus').then(setRelay, () => undefined)
  }, [installedVersion])

  // The relay changes outside the app too (a port freed, aas relay stop), so each page change re-reads it.
  useEffect(() => {
    callRpc<RelayStatus>('getRelayStatus').then(setRelay, () => undefined)
  }, [navView, categoryFilter])

  const updatable = new Set(updates.map((u) => u.slug))
  const count = (kind: Kind) => installed.filter((i) => i.category === kind).length
  const hasUpdate = (kind: Kind) => installed.some((i) => i.category === kind && updatable.has(i.slug))

  const item = (id: Section) => {
    const section = SECTIONS.find((s) => s.id === id)!
    const kind = KIND_OF[id]
    return (
      <NavItem
        key={id}
        section={section}
        current={current === id}
        narrow={narrow}
        count={kind ? count(kind) : undefined}
        dot={kind ? hasUpdate(kind) : false}
      />
    )
  }

  const relayNow = relayState(relay)
  const relayLabel = relayNow === 'stopped' ? t('shell.relayOff') : relayNow === 'failed' ? t('relayCtl.sidebarFailed') : t('shell.relayOn')

  return (
    <nav
      aria-label={t('nav.main')}
      className="flex w-[204px] flex-none flex-col gap-0.5 border-r border-line bg-black/[0.18] px-2 pb-2 pt-2.5 max-[1040px]:w-14"
    >
      {item('discover')}
      <div className="px-2.5 pb-1.5 pt-3 font-mono text-[11px] font-medium leading-none text-fg-3 max-[1040px]:sr-only">{t('nav.local')}</div>
      {item('skills')}
      {item('mcp')}
      {item('providers')}
      {item('usage')}
      <ProjectsGroup narrow={narrow} />

      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-2">
        {item('settings')}
        {relay && (
          <Tooltip label={`${t('shell.relayTitle')} · ${relayLabel}`} disabled={!narrow}>
            <button
              type="button"
              onClick={() => navigate('providers')}
              className="flex h-[34px] w-full items-center gap-2.5 whitespace-nowrap rounded-[9px] px-2.5 text-[12.5px] text-fg-2 hover:bg-panel hover:text-fg max-[1040px]:justify-center max-[1040px]:px-0"
            >
              <i
                aria-hidden
                className={cn(
                  'mx-[4.5px] h-2 w-2 flex-none rounded-full',
                  relayNow === 'stopped'
                    ? 'bg-fg-3'
                    : relayNow === 'failed'
                      ? 'bg-warn'
                      : 'bg-provider shadow-[0_0_0_3px_rgb(var(--provider-rgb)/0.18),0_0_10px_rgb(var(--provider-rgb)/0.8)]'
                )}
              />
              <span className="max-[1040px]:sr-only">{relayLabel}</span>
            </button>
          </Tooltip>
        )}
        <AccountMenu narrow={narrow} />
      </div>
    </nav>
  )
}
