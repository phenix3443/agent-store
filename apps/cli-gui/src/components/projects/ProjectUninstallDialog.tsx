import { useState } from 'react'
import type { Project, ProjectMcp, ProjectSkill } from '@as/types'
import { callRpc, errorText, RpcError } from '../../lib/rpc'
import { describeError, type FriendlyError } from '../../lib/errors'
import { mcpEnv, relPath } from '../../lib/projects'
import { useProjects } from '../../state/Projects'
import { useTerminalLog } from '../../state/TerminalLog'
import { useT } from '../../i18n'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTitle } from '../ui/dialog'
import { Banner } from '../ui/states'
import { toast } from '../ui/toast'
import { ErrorDetails, Steps } from '../library/parts'

export type ProjectItem = ProjectSkill | ProjectMcp

/** What `uninstallFromProject` changes: only the copies and entries Agent Store wrote. */
export function uninstallEffects(project: Pick<Project, 'path'>, item: ProjectItem, t: (k: string) => string): string[] {
  const lines: string[] = []
  if (item.kind === 'skill') {
    for (const loc of item.locations) if (loc.managed) lines.push(t('pj.un.skill').replace('{0}', relPath(project, loc.path)))
    return lines
  }
  for (const loc of item.locations) if (loc.managed) lines.push(t('pj.un.mcp').replace('{0}', relPath(project, loc.file)))
  if (item.overridesUser) lines.push(t('pj.un.over').replace('{0}', item.name))
  if (mcpEnv(item).length) lines.push(t('pj.un.keepEnv'))
  return lines
}

type Phase = { running: boolean; error?: FriendlyError; forceable?: boolean }

export function ProjectUninstallDialog({ project, item, onClose }: { project: Project; item: ProjectItem | null; onClose: () => void }) {
  const t = useT()
  const { reload } = useProjects()
  const { appendLine } = useTerminalLog()
  const [phase, setPhase] = useState<Phase>({ running: false })

  function close() {
    if (phase.running) return
    setPhase({ running: false })
    onClose()
  }

  async function run(force: boolean) {
    if (!item?.slug) return
    setPhase({ running: true })
    appendLine(`$ aas uninstall ${item.slug} --project ${project.id}${force ? ' --force' : ''}`)
    try {
      await callRpc('uninstallFromProject', force ? [project.id, item.slug, { force: true }] : [project.id, item.slug])
      const done = t('pj.un.done').replace('{0}', item.name).replace('{1}', project.name)
      appendLine(`✓ ${t('pj.log.uninstalled').replace('{0}', item.name).replace('{1}', project.name)}`, 'green')
      toast(done)
      reload()
      setPhase({ running: false })
      onClose()
    } catch (err) {
      appendLine(`✗ ${errorText(err)}`, 'red')
      const forceable = !force && err instanceof RpcError && err.code === 'ProjectConflictError' && err.fields.reason === 'modified'
      setPhase({ running: false, error: describeError(err, t, 'uninstall'), forceable })
      reload()
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent aria-describedby={undefined} layer="top" data-kind={item?.kind}>
        {item && (
          <>
            <DialogBody>
              <DialogTitle>{t('pj.un.title').replace('{0}', item.name).replace('{1}', project.name)}</DialogTitle>
              <p className="mb-3.5 text-[13px] text-fg-2">{t('pj.un.lede')}</p>
              <Steps lines={uninstallEffects(project, item, t)} />
              <p className="mt-2.5 text-[11.5px] text-fg-3">{t('pj.un.vcs')}</p>
              {phase.error && (
                <div className="mt-3">
                  <Banner tone="error" title={t('pj.un.failed')}>
                    <p>{phase.error.message}</p>
                    <ErrorDetails detail={phase.error.detail} />
                  </Banner>
                  {phase.forceable && <p className="mt-2 text-[12px] text-fg-2">{t('pj.un.forceHint')}</p>}
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              <Button data-autofocus onClick={close} disabled={phase.running}>
                {phase.error && !phase.forceable ? t('ui.close') : t('common.cancel')}
              </Button>
              {phase.forceable ? (
                <Button variant="danger" disabled={phase.running} onClick={() => void run(true)}>
                  {t('pj.un.force')}
                </Button>
              ) : (
                !phase.error && (
                  <Button variant="danger" disabled={phase.running} onClick={() => void run(false)}>
                    {t('act.uninstall')}
                  </Button>
                )
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
