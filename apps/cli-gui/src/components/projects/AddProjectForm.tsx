import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { Project } from '@as/types'
import { callRpc, errorText, RpcError } from '../../lib/rpc'
import { describeError, type FriendlyError } from '../../lib/errors'
import { expandHome, looksAbsolute, pickFolder } from '../../lib/folderPicker'
import { useProjects } from '../../state/Projects'
import { useTerminalLog } from '../../state/TerminalLog'
import { useT } from '../../i18n'
import { Button } from '../ui/button'
import { DialogBody, DialogFooter, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { toast } from '../ui/toast'
import { ErrorDetails } from '../library/parts'

interface Failure extends FriendlyError {
  /** The project that already has this folder. */
  dup?: Project
}

/**
 * `addProject`, or `relocateProject` when `relocate` is given. Renders a dialog body and footer,
 * so it fits the project dialog and the install dialog's 添加项目… step alike.
 */
export function AddProjectForm({
  relocate,
  cancelLabel,
  onCancel,
  onDone,
  onOpenExisting,
}: {
  relocate?: Project
  cancelLabel?: string
  onCancel: () => void
  onDone: (project: Project) => void
  onOpenExisting: (project: Project) => void
}) {
  const t = useT()
  const { projects, reload } = useProjects()
  const { appendLine } = useTerminalLog()
  const [path, setPath] = useState(relocate?.path ?? '')
  const [name, setName] = useState('')
  const [failure, setFailure] = useState<Failure | null>(null)
  const [busy, setBusy] = useState(false)

  async function pick() {
    try {
      const picked = await pickFolder(path.trim() || undefined)
      if (picked) {
        setPath(picked)
        setFailure(null)
      }
    } catch (err) {
      setFailure({ message: t('pj.new.pickFailed'), detail: errorText(err) })
    }
  }

  async function submit() {
    const typed = path.trim().replace(/(.)[\\/]+$/, '$1')
    if (!looksAbsolute(typed)) {
      setFailure({ message: t('pj.new.errPath') })
      return
    }
    setBusy(true)
    setFailure(null)
    let full = typed
    try {
      full = await expandHome(typed)
      let result: Project
      if (relocate) {
        appendLine(`$ aas projects move ${relocate.id} ${full}`)
        result = await callRpc<Project>('relocateProject', [relocate.id, full])
        appendLine(`✓ ${t('pj.log.moved').replace('{0}', result.name).replace('{1}', result.path)}`, 'green')
        toast(t('pj.rel.done').replace('{0}', result.name))
      } else {
        const label = name.trim()
        appendLine(`$ aas projects add ${full}${label ? ` --name ${label}` : ''}`)
        result = await callRpc<Project>('addProject', label ? [full, { name: label }] : [full])
        appendLine(`✓ ${t('pj.log.added').replace('{0}', result.name)}`, 'green')
        toast(t('pj.new.done').replace('{0}', result.name))
      }
      reload()
      onDone(result)
    } catch (err) {
      appendLine(`✗ ${errorText(err)}`, 'red')
      const friendly = describeError(err, t)
      const dup =
        err instanceof RpcError && err.fields.reason === 'already-registered'
          ? projects.find((p) => p.id !== relocate?.id && (p.path === full || p.path === typed))
          : undefined
      setFailure(dup ? { message: t('pj.new.errDup').replace('{0}', dup.name), detail: friendly.detail ?? errorText(err), dup } : friendly)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogBody>
        <form
          id="project-path-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <DialogTitle>{relocate ? t('pj.rel.title').replace('{0}', relocate.name) : t('pj.new.title')}</DialogTitle>
          <p className="mb-3.5 text-[13px] text-fg-2">{t(relocate ? 'pj.rel.sub' : 'pj.new.sub')}</p>
          <label htmlFor="project-path" className="mb-[5px] block text-[11.5px] font-semibold text-fg-2">
            {t('pj.new.path')}
          </label>
          <div className="flex gap-2">
            <Input
              id="project-path"
              mono
              data-autofocus
              autoComplete="off"
              spellCheck={false}
              placeholder="~/code/my-repo"
              value={path}
              invalid={!!failure}
              aria-describedby={failure ? 'project-path-error' : undefined}
              onChange={(e) => {
                setPath(e.target.value)
                setFailure(null)
              }}
            />
            <Button onClick={() => void pick()}>
              <FolderOpen />
              {t('pj.new.pick')}
            </Button>
          </div>
          {failure && (
            <div id="project-path-error" role="alert" className="mt-1.5 text-[12px] text-bad">
              <p>
                {failure.message}
                {failure.dup && (
                  <>
                    {' '}
                    <button type="button" className="font-semibold text-fg underline underline-offset-[3px]" onClick={() => onOpenExisting(failure.dup!)}>
                      {t('pj.new.errOpen')}
                    </button>
                  </>
                )}
              </p>
              <ErrorDetails detail={failure.detail} />
            </div>
          )}
          {!relocate && (
            <div className="mt-3">
              <label htmlFor="project-name" className="mb-[5px] block text-[11.5px] font-semibold text-fg-2">
                {t('pj.new.name')}
              </label>
              <Input id="project-name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
              <p className="mt-1 text-[11.5px] text-fg-3">{t('pj.new.nameHint')}</p>
            </div>
          )}
        </form>
      </DialogBody>
      <DialogFooter>
        <Button onClick={onCancel} disabled={busy}>
          {cancelLabel ?? t('common.cancel')}
        </Button>
        <Button variant="primary" type="submit" form="project-path-form" disabled={busy || !path.trim()}>
          {t(relocate ? 'pj.rel.go' : 'pj.add')}
        </Button>
      </DialogFooter>
    </>
  )
}
