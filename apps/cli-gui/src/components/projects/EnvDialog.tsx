import { useState } from 'react'
import type { Project } from '@as/types'
import { callRpc, errorText } from '../../lib/rpc'
import { describeError } from '../../lib/errors'
import { useProjects } from '../../state/Projects'
import { useTerminalLog } from '../../state/TerminalLog'
import { useT } from '../../i18n'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTitle } from '../ui/dialog'
import { Banner } from '../ui/states'
import { toast } from '../ui/toast'
import { ErrorDetails } from '../library/parts'
import { SecretInput } from '../library/McpPane'

export interface EnvRequest {
  /** The MCP server the keys are for; absent when one variable is edited from the 密钥 list. */
  server?: string
  names: string[]
  /** How each variable appears in the project files, e.g. `${TOKEN}`. */
  refs: Record<string, string>
  /** Still missing after this save, to say so in the toast. */
  missing: string[]
}

/**
 * Stores values with `setProjectEnv`. Values never come back from the engine, so the
 * fields start empty and a blank one leaves that variable as it was.
 */
export function EnvDialog({ project, request, onClose }: { project: Project; request: EnvRequest | null; onClose: () => void }) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} layer="top">
        {request && <EnvForm key={request.names.join(',')} project={project} request={request} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

/** `setProjectEnv` for each filled value; shared with the install dialog's last step. */
export function useSaveEnv() {
  const t = useT()
  const { reload } = useProjects()
  const { appendLine } = useTerminalLog()
  return async function save(projectId: string, values: Record<string, string>): Promise<{ failed: string[]; error?: ReturnType<typeof describeError> }> {
    const failed: string[] = []
    let error: ReturnType<typeof describeError> | undefined
    for (const [name, value] of Object.entries(values)) {
      if (!value) continue
      appendLine(`$ aas projects set-env ${projectId} ${name}`)
      try {
        await callRpc('setProjectEnv', [projectId, name, value])
      } catch (err) {
        appendLine(`✗ ${errorText(err)}`, 'red')
        failed.push(name)
        error = describeError(err, t)
      }
    }
    reload()
    return { failed, error }
  }
}

function EnvForm({ project, request, onClose }: { project: Project; request: EnvRequest; onClose: () => void }) {
  const t = useT()
  const save = useSaveEnv()
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null)
  const filled = request.names.filter((n) => values[n])

  async function submit() {
    setBusy(true)
    const { failed, error: err } = await save(project.id, values)
    setBusy(false)
    if (failed.length) {
      setError({ message: `${t('pj.vars.failed').replace('{0}', failed.join(', '))} ${err?.message ?? ''}`.trim(), detail: err?.detail })
      return
    }
    const still = request.missing.filter((n) => !values[n])
    const label = request.server ?? filled.join(', ')
    toast(still.length ? t('pj.vars.partial').replace('{0}', still.join(', ')) : t('pj.vars.saved').replace('{0}', label))
    onClose()
  }

  return (
    <>
      <DialogBody>
        <form
          id="project-env-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (filled.length) void submit()
          }}
        >
          <DialogTitle>
            {request.server ? t('pj.vars.title').replace('{0}', request.server) : t('pj.vars.titleOne').replace('{0}', request.names[0])}
          </DialogTitle>
          <p className="mb-3.5 text-[13px] text-fg-2">{t('pj.vars.sub')}</p>
          {request.names.map((name, i) => {
            const id = `project-env-${name}`
            return (
              <div key={name} className="mb-3">
                <label htmlFor={id} className="mb-[5px] block font-mono text-[11.5px] font-semibold text-fg-2">
                  {name}
                </label>
                <div {...(i === 0 ? { 'data-autofocus-wrap': true } : {})}>
                  <SecretInput id={id} secret value={values[name] ?? ''} placeholder={name} onChange={(v) => setValues((cur) => ({ ...cur, [name]: v }))} />
                </div>
                {request.refs[name] && (
                  <p className="mt-1 text-[11.5px] text-fg-3">
                    {t('pj.vars.ref')} <code className="font-mono text-[11px] text-fg-2">{request.refs[name]}</code>
                  </p>
                )}
              </div>
            )
          })}
          <p className="text-[11.5px] text-fg-3">{t('pj.vars.keep')}</p>
          {error && (
            <div className="mt-3">
              <Banner tone="error">
                <p className="text-fg">{error.message}</p>
                <ErrorDetails detail={error.detail} />
              </Banner>
            </div>
          )}
        </form>
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" type="submit" form="project-env-form" disabled={busy || filled.length === 0}>
          {t('common.save')}
        </Button>
      </DialogFooter>
    </>
  )
}
