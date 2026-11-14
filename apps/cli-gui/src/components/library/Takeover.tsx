import { useState } from 'react'
import type { ToolTarget } from '@as/types'
import { AGENTS } from '../../lib/agents'
import type { FriendlyError } from '../../lib/errors'
import { useT } from '../../i18n'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTitle } from '../ui/dialog'
import { Banner } from '../ui/states'
import { ErrorDetails, Steps } from './parts'

/** Where `replace` keeps the agent's own entry: `previous` in the item's targets.json. */
export function savedEntryPath(slug: string, dir?: string): string {
  return `${dir ?? `~/.agent-store/mcps/${slug}`}/targets.json`
}

/** What 替换现有条目 does and leaves alone, as the engine's `enable --replace` does it. */
export function TakeoverEffects({ target, slug, dir }: { target: ToolTarget; slug: string; dir?: string }) {
  const t = useT()
  const agent = AGENTS.find((a) => a.id === target)!
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-[11.5px] font-semibold text-fg-3">{t('takeover.will')}</h4>
      <Steps
        lines={[
          t('takeover.w1').replace('{0}', agent.name),
          t('takeover.w2').replace('{0}', savedEntryPath(slug, dir)),
          t('takeover.w3').replace('{0}', `${agent.mcp} › ${agent.mcpKey}.${slug}`),
          t('takeover.w4').replace('{0}', agent.name),
        ]}
      />
      <h4 className="mt-1 text-[11.5px] font-semibold text-fg-3">{t('takeover.wont')}</h4>
      <Steps lines={[t('takeover.n1').replace('{0}', agent.mcp), t('takeover.n2')]} />
    </div>
  )
}

export interface TakeoverRequest {
  slug: string
  name: string
  target: ToolTarget
  dir?: string
}

/** Confirm, then enable with `replace`; a refusal (no CLI, not restorable) stays in the dialog. */
export function TakeoverDialog({
  request,
  onClose,
  onReplace,
}: {
  request: TakeoverRequest | null
  onClose: () => void
  /** Resolves to the error when the engine refused. */
  onReplace: (r: TakeoverRequest) => Promise<FriendlyError | null>
}) {
  const t = useT()
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<FriendlyError | null>(null)
  const agent = request ? AGENTS.find((a) => a.id === request.target)! : null

  function close() {
    if (running) return
    setError(null)
    onClose()
  }

  async function replace() {
    if (!request) return
    setRunning(true)
    setError(null)
    const failed = await onReplace(request)
    setRunning(false)
    if (failed) setError(failed)
    else onClose()
  }

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent aria-describedby={undefined} layer="top" data-kind="mcp">
        {request && agent && (
          <DialogBody>
            <DialogTitle>{t('takeover.title').replace('{0}', agent.name)}</DialogTitle>
            <p className="mb-3.5 text-[13px] text-fg-2">{t('takeover.lede').replace('{0}', agent.name).replace('{1}', request.slug)}</p>
            <TakeoverEffects target={request.target} slug={request.slug} dir={request.dir} />
            {error && (
              <div className="mt-3">
                <Banner tone="error">
                  <p className="text-fg">{error.message}</p>
                  <ErrorDetails detail={error.detail} />
                </Banner>
              </div>
            )}
          </DialogBody>
        )}
        <DialogFooter>
          <Button onClick={close} disabled={running}>
            {error ? t('ui.close') : t('common.cancel')}
          </Button>
          {!error && (
            <Button variant="kind" data-kind="mcp" disabled={running} onClick={() => void replace()}>
              {running ? t('takeover.running') : t('takeover.confirm')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
