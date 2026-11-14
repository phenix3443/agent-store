import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import type { ProjectDetail } from '@as/types'
import { callRpc } from '../../lib/rpc'
import { itemCount, missingKeys } from '../../lib/projects'
import { useOpenProject } from '../../lib/useNavigate'
import { useAppState } from '../../state/AppState'
import { useProjects } from '../../state/Projects'
import { useT } from '../../i18n'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Banner, EmptyState, LoadingRows, Skeleton } from '../ui/states'
import { ErrorDetails, ListBox, PageWithPane, ViewHeader } from '../library/parts'
import { FolderTile } from './parts'

/** Each project's detail, for its item count and missing keys; one sidecar call per project. */
function useDetails(ids: string[]) {
  const { version } = useProjects()
  const { installedVersion } = useAppState()
  const [details, setDetails] = useState<Record<string, ProjectDetail | null>>({})
  const key = ids.join(',')
  useEffect(() => {
    let cancelled = false
    for (const id of ids) {
      callRpc<ProjectDetail>('getProject', [id]).then(
        (d) => !cancelled && setDetails((cur) => ({ ...cur, [id]: d })),
        () => !cancelled && setDetails((cur) => ({ ...cur, [id]: null }))
      )
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, installedVersion])
  return details
}

/** 项目: the registered project folders. */
export function ProjectsPage() {
  const t = useT()
  const { projects, loading, error, reload, openDialog } = useProjects()
  const openProject = useOpenProject()
  const details = useDetails(projects.map((p) => p.id))

  const add = (
    <Button size="sm" onClick={() => openDialog({ kind: 'add' })}>
      <Plus />
      {t('pj.add')}
    </Button>
  )

  let body
  if (loading) body = <LoadingRows rows={3} label={t('ui.loading')} />
  else if (error && projects.length === 0) {
    body = (
      <Banner tone="error" title={t('pj.listErrT')} actions={<Button size="sm" onClick={reload}>{t('ui.retry')}</Button>}>
        <p>{t('pj.listErrD')}</p>
        <ErrorDetails detail={error} />
      </Banner>
    )
  } else if (projects.length === 0) {
    body = (
      <EmptyState
        title={t('pj.noneT')}
        body={t('pj.noneD')}
        action={
          <Button variant="primary" onClick={() => openDialog({ kind: 'add' })}>
            {t('pj.add')}
          </Button>
        }
      />
    )
  } else {
    body = (
      <ListBox label={t('pj.title')}>
        {projects.map((p) => {
          const d = details[p.id]
          const missing = d ? missingKeys(d).length > 0 : false
          return (
            <div
              key={p.id}
              className="relative flex min-h-[58px] items-center gap-3 border-b border-line px-3 py-2.5 transition-colors last:border-b-0 hover:bg-panel has-[[data-row-main]:focus-visible]:rounded-ctl has-[[data-row-main]:focus-visible]:outline has-[[data-row-main]:focus-visible]:outline-2 has-[[data-row-main]:focus-visible]:-outline-offset-2 has-[[data-row-main]:focus-visible]:outline-mcp"
            >
              <button
                type="button"
                data-row-main
                onClick={() => openProject(p.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left after:absolute after:inset-0 focus-visible:outline-none"
              >
                <FolderTile />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                    <span className="truncate">{p.name}</span>
                    {!p.exists && <Badge tone="warn">{t('pj.missingChip')}</Badge>}
                    {p.exists && missing && <Badge tone="warn">{t('st.noKey')}</Badge>}
                  </span>
                  <span className="block truncate font-mono text-[11.5px] text-fg-3">{p.path}</span>
                </span>
              </button>
              <span className="relative min-w-14 text-right font-mono text-[11.5px] font-medium text-fg-3">
                {!p.exists || d === null ? '' : d ? t('pj.count').replace('{0}', String(itemCount(d))) : <Skeleton className="inline-block h-2.5 w-10" />}
              </span>
            </div>
          )
        })}
      </ListBox>
    )
  }

  return (
    <PageWithPane
      view={
        <>
          <ViewHeader title={t('pj.title')} sub={t('pj.sub')} actions={add} />
          {body}
        </>
      }
      pane={null}
    />
  )
}
