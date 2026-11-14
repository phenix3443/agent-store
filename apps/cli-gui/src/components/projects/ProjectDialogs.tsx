import { useRef, useState } from 'react'
import type { Project } from '@as/types'
import { callRpc, errorText } from '../../lib/rpc'
import { describeError, type FriendlyError } from '../../lib/errors'
import { useOpenProject } from '../../lib/useNavigate'
import { useAppState } from '../../state/AppState'
import { useProjects } from '../../state/Projects'
import { useTerminalLog } from '../../state/TerminalLog'
import { useT } from '../../i18n'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTitle } from '../ui/dialog'
import { Banner } from '../ui/states'
import { toast } from '../ui/toast'
import { ErrorDetails, Section, Steps } from '../library/parts'
import { AddProjectForm } from './AddProjectForm'

function RemoveBody({ project, storedKeys, onClose }: { project: Project; storedKeys: number; onClose: () => void }) {
  const t = useT()
  const { reload } = useProjects()
  const { appendLine } = useTerminalLog()
  const { navView, projectId } = useAppState()
  const openProject = useOpenProject()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FriendlyError | null>(null)

  async function remove() {
    setBusy(true)
    appendLine(`$ aas projects remove ${project.id}`)
    try {
      await callRpc('removeProject', [project.id])
      appendLine(`✓ ${t('pj.log.removed').replace('{0}', project.name)}`, 'green')
      toast(t('pj.rm.done').replace('{0}', project.name))
      reload()
      if (navView === 'project' && projectId === project.id) openProject(null)
      onClose()
    } catch (err) {
      appendLine(`✗ ${errorText(err)}`, 'red')
      setError(describeError(err, t))
      setBusy(false)
    }
  }

  const will = [t('pj.rm.list').replace('{0}', project.path)]
  if (storedKeys > 0) will.push(t('pj.rm.env').replace('{0}', String(storedKeys)))
  return (
    <>
      <DialogBody>
        <DialogTitle>{t('pj.rm.title').replace('{0}', project.name)}</DialogTitle>
        <p className="mb-1 text-[13px] text-fg-2">{t('pj.rm.sub')}</p>
        <Section title={t('pj.rm.will')} className="mt-3">
          <Steps lines={will} />
        </Section>
        <Section title={t('pj.rm.wont')} className="mt-3">
          <Steps lines={[t('pj.rm.files')]} />
        </Section>
        <p className="mt-3 text-[12px] text-fg-3">{t('pj.rm.readd')}</p>
        {error && (
          <div className="mt-3">
            <Banner tone="error" title={t('pj.rm.failed')}>
              <p>{error.message}</p>
              <ErrorDetails detail={error.detail} />
            </Banner>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button data-autofocus onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void remove()}>
          {t('pj.remove')}
        </Button>
      </DialogFooter>
    </>
  )
}

/** 添加项目, 重新定位 and 移除项目, opened from the sidebar, the palette and the project pages. */
export function ProjectDialogs() {
  const { dialog, openDialog } = useProjects()
  const openProject = useOpenProject()
  const close = () => openDialog(null)
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent
        ref={contentRef}
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          const target = contentRef.current?.querySelector<HTMLElement>('[data-autofocus]')
          if (target) {
            e.preventDefault()
            target.focus()
          }
        }}
      >
        {dialog?.kind === 'remove' && <RemoveBody project={dialog.project} storedKeys={dialog.storedKeys} onClose={close} />}
        {(dialog?.kind === 'add' || dialog?.kind === 'relocate') && (
          <AddProjectForm
            key={dialog.kind === 'relocate' ? dialog.project.id : 'add'}
            relocate={dialog.kind === 'relocate' ? dialog.project : undefined}
            onCancel={close}
            onDone={(p) => {
              close()
              openProject(p.id)
            }}
            onOpenExisting={(p) => {
              close()
              openProject(p.id)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
