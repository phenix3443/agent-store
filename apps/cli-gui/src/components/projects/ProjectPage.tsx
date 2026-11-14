import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Info, KeyRound, Lock, Plus } from 'lucide-react'
import type { InstalledItem, Project, ProjectDetail, ProjectEnvVar, ProjectMcp, ProjectMcpLocation, ProjectSkill } from '@as/types'
import { callRpc, errorText, RpcError } from '../../lib/rpc'
import { formatVersion } from '../../lib/catalog'
import { AGENTS, TARGET_LABEL, joinNames } from '../../lib/agents'
import { codexUntrusted, envState, mcpEnv, relPath, trustSnippet } from '../../lib/projects'
import { useNavigate, useOpenProject } from '../../lib/useNavigate'
import { useAppState } from '../../state/AppState'
import { useProjects } from '../../state/Projects'
import { useTerminalLog } from '../../state/TerminalLog'
import { useI18n, useT, type TFn } from '../../i18n'
import { CategoryIcon } from '../CategoryIcon'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Banner, EmptyState, LoadingRows } from '../ui/states'
import { toast } from '../ui/toast'
import { CodeLine, ErrorDetails, ListBox, PageWithPane } from '../library/parts'
import { BlockHeading, FolderTile, PlainRow } from './parts'
import { EnvDialog, type EnvRequest } from './EnvDialog'
import { ProjectUninstallDialog, type ProjectItem } from './ProjectUninstallDialog'
import { RevealButton } from '../ui/reveal'
import { loadProjectSnapshot, saveProjectSnapshot, type ProjectSnapshot } from '../../lib/projectSnapshots'

type Load = { state: 'loading' } | { state: 'error'; message: string; notFound: boolean } | { state: 'ready'; detail: ProjectDetail }

function useProjectDetail(id: string) {
  const { version } = useProjects()
  const { installedVersion } = useAppState()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    callRpc<ProjectDetail>('getProject', [id]).then(
      (detail) => {
        if (cancelled) return
        setLoad({ state: 'ready', detail })
        if (detail.exists) {
          setSnapshot(null)
          void saveProjectSnapshot(detail)
        }
        else void loadProjectSnapshot(id).then((snap) => !cancelled && setSnapshot(snap))
      },
      (err) =>
        !cancelled &&
        setLoad({ state: 'error', message: errorText(err), notFound: err instanceof RpcError && err.code === 'ProjectNotFoundError' })
    )
    return () => {
      cancelled = true
    }
  }, [id, version, installedVersion, nonce])

  return { load, snapshot, retry: () => setNonce((n) => n + 1) }
}

/** Slugs of the global MCP entries Agent Store installed, for 查看全局的条目. */
function useGlobalMcpSlugs(): Set<string> {
  const { installedVersion } = useAppState()
  const [slugs, setSlugs] = useState<Set<string>>(new Set())
  useEffect(() => {
    callRpc<InstalledItem[]>('list').then(
      (list) => setSlugs(new Set(list.filter((i) => i.category === 'mcp').map((i) => i.slug))),
      () => undefined
    )
  }, [installedVersion])
  return slugs
}

function locationNote(loc: ProjectMcpLocation, t: TFn): string {
  if (loc.scope === 'local') return t('pj.loc.local')
  if (loc.agent === 'claude') {
    if (loc.shadowedBy) return t('pj.loc.shadowed')
    return t(`pj.loc.${loc.approval ?? 'pending'}`)
  }
  return t(loc.active ? 'pj.loc.active' : 'pj.loc.untrusted')
}

function Locations({
  project,
  lines,
}: {
  project: Project
  lines: { key: string; agent: string; path: string; abs: string; note?: string; warn?: boolean; edited?: boolean }[]
}) {
  const t = useI18n().t
  return (
    <ul className="flex flex-col gap-1 border-t border-line bg-white/[0.015] py-2 pl-[60px] pr-3 text-[11.5px] text-fg-3">
      {lines.map((l) => (
        <li key={l.key} className="flex flex-wrap items-center gap-x-2">
          <RevealButton path={l.abs} label={`${l.agent} · ${l.path}`} iconOnly disabled={!project.exists} />
          <b className="font-semibold text-fg-2">{l.agent}</b>
          <code className="break-all font-mono text-[11px]">{l.path}</code>
          {l.note && <span className={l.warn ? 'text-warn' : undefined}>· {l.note}</span>}
          {l.edited && <span className="text-warn">· {t('pj.modified')}</span>}
        </li>
      ))}
    </ul>
  )
}

function SourceChip({ managed, modified }: { managed: boolean; modified: boolean }) {
  const t = useI18n().t
  return (
    <>
      <Badge tone={managed ? 'ok' : 'neutral'} title={t(managed ? 'pj.srcOursD' : 'pj.srcOwnD')}>
        {t(managed ? 'pj.srcOurs' : 'pj.srcOwn')}
      </Badge>
      {modified && (
        <Badge tone="warn" title={t('pj.modifiedD')}>
          {t('pj.modified')}
        </Badge>
      )}
    </>
  )
}

function SkillRow({ project, skill, onUninstall }: { project: Project; skill: ProjectSkill; onUninstall: () => void }) {
  const { locale, t } = useI18n()
  const agents = AGENTS.filter((a) => skill.agents.includes(a.id)).map((a) => a.name)
  const locs = [...skill.locations].sort((a, b) => a.agent.localeCompare(b.agent))
  return (
    <PlainRow
      kind="skill"
      lead={<CategoryIcon category="skill" />}
      title={skill.name}
      chips={<SourceChip managed={skill.managed} modified={skill.locations.some((l) => l.modified)} />}
      sub={
        <>
          {agents.length ? t('pj.for').replace('{0}', joinNames(agents, locale)) : t('pj.forNone')}
          {skill.version && <span className="font-mono text-[11.5px]"> · {formatVersion(skill.version)}</span>}
          {skill.description && <span> · {skill.description}</span>}
        </>
      }
      right={
        skill.managed && skill.slug && project.exists ? (
          <Button size="sm" variant="danger" aria-label={`${t('act.uninstall')} · ${skill.name}`} onClick={onUninstall}>
            {t('act.uninstall')}
          </Button>
        ) : undefined
      }
      below={
        <Locations
          project={project}
          lines={locs.map((l, i) => ({ key: `${l.agent}${i}`, agent: TARGET_LABEL[l.agent], path: relPath(project, l.path), abs: l.path, edited: l.modified }))}
        />
      }
    />
  )
}

function McpRow({
  project,
  mcp,
  globalSlug,
  onUninstall,
  onKeys,
}: {
  project: Project
  mcp: ProjectMcp
  /** The global library entry of the same name, when Agent Store installed one. */
  globalSlug?: string
  onUninstall: () => void
  onKeys: (names: string[]) => void
}) {
  const { locale, t } = useI18n()
  const navigate = useNavigate()
  const { setSelectedSlug } = useAppState()
  const [open, setOpen] = useState(false)
  const agents = AGENTS.filter((a) => mcp.agents.includes(a.id)).map((a) => a.name)
  const env = mcpEnv(mcp)
  const noteId = `pj-over-${mcp.name}`
  const locs = [...mcp.locations].sort((a, b) => a.agent.localeCompare(b.agent) || a.scope.localeCompare(b.scope))
  return (
    <PlainRow
      kind="mcp"
      lead={<CategoryIcon category="mcp" />}
      title={mcp.name}
      chips={
        <>
          <SourceChip managed={mcp.managed} modified={mcp.locations.some((l) => l.modified)} />
          {mcp.overridesUser && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={noteId}
              title={t('pj.overD').replace('{0}', mcp.name)}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-[22px] items-center gap-1 rounded-full border border-line bg-panel px-2 text-[11.5px] font-normal text-fg-2 hover:border-line-strong hover:text-fg"
            >
              {t('pj.over')}
              {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          {mcp.missingEnv.length > 0 && (
            <button
              type="button"
              disabled={!project.exists}
              title={t('pj.env.missing')}
              onClick={() => onKeys(mcp.missingEnv)}
              className="inline-flex h-[22px] items-center gap-1 rounded-full border border-warn/40 bg-warn/[0.08] px-2 text-[11.5px] font-normal text-warn hover:border-warn/70 disabled:opacity-45"
            >
              <Lock size={12} />
              {t('st.noKey')}
            </button>
          )}
        </>
      }
      sub={
        <>
          {agents.length ? t('pj.for').replace('{0}', joinNames(agents, locale)) : t('pj.forNone')}
          {mcp.version && <span className="font-mono text-[11.5px]"> · {formatVersion(mcp.version)}</span>}
        </>
      }
      right={
        <>
          {env.length > 0 && mcp.missingEnv.length === 0 && (
            <Button size="sm" icon aria-label={`${t('pj.env.change')} · ${mcp.name}`} title={t('pj.env.change')} disabled={!project.exists} onClick={() => onKeys(env)}>
              <KeyRound />
            </Button>
          )}
          {mcp.managed && mcp.slug && project.exists && (
            <Button size="sm" variant="danger" aria-label={`${t('act.uninstall')} · ${mcp.name}`} onClick={onUninstall}>
              {t('act.uninstall')}
            </Button>
          )}
        </>
      }
      below={
        <>
          {open && (
            <div id={noteId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line bg-white/[0.025] py-2.5 pl-[60px] pr-3 text-[12px] text-fg-2">
              <p className="max-w-[68ch]">{t('pj.overLong').replace('{0}', mcp.name)}</p>
              {globalSlug && (
                <button
                  type="button"
                  className="font-medium text-fg-2 underline-offset-2 hover:text-fg hover:underline"
                  onClick={() => {
                    navigate('mcp')
                    setSelectedSlug(globalSlug)
                  }}
                >
                  {t('pj.overView')}
                </button>
              )}
            </div>
          )}
          <Locations
            project={project}
            lines={locs.map((l, i) => ({
              key: `${l.agent}${l.scope}${i}`,
              agent: TARGET_LABEL[l.agent],
              path: relPath(project, l.file),
              abs: l.file,
              note: locationNote(l, t),
              warn: !l.active,
              edited: l.modified,
            }))}
          />
        </>
      }
    />
  )
}

function EnvBlock({ project, detail, onKeys }: { project: Project; detail: ProjectDetail; onKeys: (names: string[], server?: string) => void }) {
  const t = useT()
  const { reload } = useProjects()
  const { appendLine } = useTerminalLog()
  const [busy, setBusy] = useState<string | null>(null)

  async function clear(v: ProjectEnvVar) {
    setBusy(v.name)
    appendLine(`$ aas projects unset-env ${project.id} ${v.name}`)
    try {
      await callRpc('unsetProjectEnv', [project.id, v.name])
      toast(t('pj.env.cleared').replace('{0}', v.name))
    } catch (err) {
      appendLine(`✗ ${errorText(err)}`, 'red')
      toast.error(t('pj.env.clearFailed').replace('{0}', v.name))
    } finally {
      setBusy(null)
      reload()
    }
  }

  return (
    <>
      <BlockHeading title={t('pj.env.title')} count={detail.env.length} />
      <p className="mb-2 max-w-[80ch] text-[12px] text-fg-3">{t('pj.env.sub')}</p>
      {detail.env.length === 0 ? (
        <div className="rounded-box border border-dashed border-line-strong px-5 py-5 text-center text-[12.5px] text-fg-3">{t('pj.env.none')}</div>
      ) : (
        <ListBox>
          {detail.env.map((v) => {
            const state = envState(detail, v)
            return (
              <PlainRow
                key={v.name}
                lead={
                  <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-ctl border border-line bg-panel text-fg-3">
                    <KeyRound size={16} />
                  </span>
                }
                title={<code className="font-mono text-[13px]">{v.name}</code>}
                chips={
                  <Badge tone={state === 'stored' ? 'ok' : state === 'missing' ? 'warn' : 'neutral'}>
                    {t(state === 'stored' ? 'pj.env.stored' : state === 'missing' ? 'pj.env.missing' : 'pj.env.optional')}
                  </Badge>
                }
                sub={v.usedBy.length ? t('pj.env.usedBy').replace('{0}', v.usedBy.join(', ')) : t('pj.env.unused')}
                right={
                  <>
                    <Button size="sm" disabled={!project.exists || busy !== null} onClick={() => onKeys([v.name])}>
                      {t(v.stored ? 'pj.env.change' : 'pj.env.fill')}
                    </Button>
                    {v.stored && (
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void clear(v)}>
                        {t('pj.env.clear')}
                      </Button>
                    )}
                  </>
                }
              />
            )
          })}
        </ListBox>
      )}
      {detail.env.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[12px] text-fg-2">{t('pj.env.run')}</p>
          <div className="flex flex-col gap-1.5">
            <CodeLine prompt text="aas projects exec . -- claude" />
            <CodeLine prompt text="aas projects exec . -- codex" />
            <CodeLine prompt text={'eval "$(aas projects env .)"'} />
          </div>
          <p className="mt-1.5 text-[11.5px] text-fg-3">{t('pj.env.shell')}</p>
        </div>
      )}
    </>
  )
}

function Header({ project, detail, actions }: { project: Project; detail?: ProjectDetail; actions: ReactNode }) {
  const t = useT()
  const openProject = useOpenProject()
  return (
    <div className="mb-3.5 flex flex-wrap items-end gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <FolderTile size="lg" />
        <div className="min-w-0">
          <p className="mb-0.5 text-[11.5px] text-fg-3">
            <button type="button" className="font-medium text-fg-2 hover:text-fg hover:underline" onClick={() => openProject(null)}>
              {t('pj.title')}
            </button>{' '}
            /
          </p>
          <h1 className="break-words text-[19px] font-extrabold leading-[1.3]">{detail?.name ?? project.name}</h1>
          <p className="break-all font-mono text-[11.5px] text-fg-3">{detail?.path ?? project.path}</p>
        </div>
      </div>
      <span className="flex-1" />
      <div className="flex flex-wrap gap-1.5">{actions}</div>
    </div>
  )
}

/** The skill and MCP blocks; with `d.exists` false (a snapshot of a folder that is gone) every action is off. */
function ItemBlocks({
  d,
  globalSlugs,
  onUninstall,
  onKeys,
}: {
  d: ProjectDetail
  globalSlugs: Set<string>
  onUninstall: (item: ProjectItem) => void
  onKeys: (names: string[], server?: string) => void
}) {
  const t = useT()
  return (
    <>
      <BlockHeading kind="skill" title={t('categories.skill')} count={d.skills.length} where={t('pj.whereSkill')} />
      {d.skills.length ? (
        <ListBox>
          {d.skills.map((s) => (
            <SkillRow key={s.slug ?? s.name} project={d} skill={s} onUninstall={() => onUninstall(s)} />
          ))}
        </ListBox>
      ) : (
        <div className="rounded-box border border-dashed border-line-strong px-5 py-5 text-center text-[12.5px] text-fg-3">{t('pj.secNoneSkill')}</div>
      )}
      <BlockHeading kind="mcp" title="MCP" count={d.mcps.length} where={t('pj.whereMcp')} />
      {d.mcps.length ? (
        <ListBox>
          {d.mcps.map((m) => (
            <McpRow
              key={m.name}
              project={d}
              mcp={m}
              globalSlug={globalSlugs.has(m.name) ? m.name : undefined}
              onUninstall={() => onUninstall(m)}
              onKeys={(names) => onKeys(names, m.name)}
            />
          ))}
        </ListBox>
      ) : (
        <div className="rounded-box border border-dashed border-line-strong px-5 py-5 text-center text-[12.5px] text-fg-3">{t('pj.secNoneMcp')}</div>
      )}
    </>
  )
}

/** One registered project: what Claude Code and Codex use there, and the keys stored for it on this machine. */
export function ProjectPage({ id }: { id: string }) {
  const t = useT()
  const { projects, loading: listLoading, openDialog } = useProjects()
  const { setDiscoverKind, setInstallInto } = useAppState()
  const navigate = useNavigate()
  const openProject = useOpenProject()
  const globalSlugs = useGlobalMcpSlugs()
  const { load, snapshot, retry } = useProjectDetail(id)
  const [uninstalling, setUninstalling] = useState<ProjectItem | null>(null)
  const [keys, setKeys] = useState<EnvRequest | null>(null)

  const listed = projects.find((p) => p.id === id)
  const detail = load.state === 'ready' ? load.detail : undefined
  const project: Project | undefined = detail ?? listed

  if (!project) {
    if (listLoading || load.state === 'loading') {
      return (
        <PageWithPane view={<LoadingRows rows={4} label={t('pj.loading')} />} pane={null} />
      )
    }
    return (
      <PageWithPane
        view={
          <EmptyState
            title={t('pj.nfT')}
            body={t('pj.nfD')}
            action={
              <Button variant="primary" onClick={() => openProject(null)}>
                {t('pj.title')}
              </Button>
            }
          />
        }
        pane={null}
      />
    )
  }

  function addTo() {
    navigate('discover')
    setDiscoverKind('all')
    setInstallInto(id)
  }

  const storedKeys = detail?.env.filter((v) => v.stored).length ?? 0
  const remove = () => openDialog({ kind: 'remove', project: project!, storedKeys })
  const relocate = () => openDialog({ kind: 'relocate', project: project! })

  function askKeys(names: string[], server?: string) {
    if (!detail) return
    const claudeRefs = new Set(detail.mcps.flatMap((m) => m.locations.filter((l) => l.agent === 'claude').flatMap((l) => l.env)))
    const refs = Object.fromEntries(names.map((n) => [n, claudeRefs.has(n) ? `\${${n}}` : n]))
    const missing = [...new Set(detail.mcps.flatMap((m) => m.missingEnv))]
    setKeys({ server, names, refs, missing })
  }

  const header = (
    <Header
      project={project}
      detail={detail}
      actions={
        <>
          <Button size="sm" disabled={!project.exists} onClick={addTo}>
            <Plus />
            {t('pj.addTo')}
          </Button>
          <RevealButton path={project.path} disabled={!project.exists} />
          <Button size="sm" onClick={relocate}>
            {t('pj.relocate')}
          </Button>
          <Button size="sm" variant="danger" onClick={remove}>
            {t('pj.remove')}
          </Button>
        </>
      }
    />
  )

  let body: ReactNode
  if (load.state === 'loading') body = <LoadingRows rows={4} label={t('pj.loading')} />
  else if (load.state === 'error') {
    body = load.notFound ? (
      <EmptyState title={t('pj.nfT')} body={t('pj.nfD')} action={<Button variant="primary" onClick={() => openProject(null)}>{t('pj.title')}</Button>} />
    ) : (
      <Banner tone="error" title={t('pj.errT')} actions={<Button size="sm" onClick={retry}>{t('ui.retry')}</Button>}>
        <p>{t('pj.errD')}</p>
        <ErrorDetails detail={load.message} />
      </Banner>
    )
  } else if (!load.detail.exists) {
    body = (
      <Banner
        tone="warn"
        title={t('pj.missingT')}
        actions={
          <>
            <Button size="sm" onClick={relocate}>
              {t('pj.relocate')}
            </Button>
            <Button size="sm" variant="danger" onClick={remove}>
              {t('pj.remove')}
            </Button>
          </>
        }
      >
        <p>{t('pj.missingD').replace('{0}', load.detail.path)}</p>
      </Banner>
    )
    if (snapshot) {
      const last: ProjectDetail = { ...snapshot.detail, ...load.detail, skills: snapshot.detail.skills, mcps: snapshot.detail.mcps, env: snapshot.detail.env }
      body = (
        <>
          {body}
          <p className="mb-1 mt-3 flex flex-wrap items-center gap-x-2 text-[12px] text-fg-3">
            <Info size={14} className="flex-none" />
            <span>{t('pjx.last')}</span>
            <span className="font-mono text-[11.5px]">{t('pjx.lastAt').replace('{0}', new Date(snapshot.at).toLocaleString())}</span>
          </p>
          <ItemBlocks d={last} globalSlugs={globalSlugs} onUninstall={() => undefined} onKeys={() => undefined} />
        </>
      )
    }
  } else {
    const d = load.detail
    const empty = d.skills.length === 0 && d.mcps.length === 0 && d.env.length === 0
    body = (
      <>
        {codexUntrusted(d) && (
          <div className="mb-3">
            <Banner tone="warn" title={t('pj.trustT')}>
              <p className="mb-2">{t('pj.trustD')}</p>
              <CodeLine text={trustSnippet(d.path)} />
            </Banner>
          </div>
        )}
        {empty ? (
          <EmptyState
            title={t('pj.emptyT')}
            body={t('pj.emptyD')}
            action={
              <Button variant="primary" onClick={addTo}>
                {t('pj.addTo')}
              </Button>
            }
          />
        ) : (
          <>
            <p className="mb-1 flex items-center gap-2 text-[12px] text-fg-3">
              <Info size={14} className="flex-none" />
              {t('pj.vcs')}
            </p>
            <ItemBlocks d={d} globalSlugs={globalSlugs} onUninstall={setUninstalling} onKeys={askKeys} />
            <EnvBlock project={d} detail={d} onKeys={askKeys} />
          </>
        )}
      </>
    )
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
        pane={null}
      />
      <ProjectUninstallDialog project={project} item={uninstalling} onClose={() => setUninstalling(null)} />
      <EnvDialog project={project} request={keys} onClose={() => setKeys(null)} />
    </>
  )
}
