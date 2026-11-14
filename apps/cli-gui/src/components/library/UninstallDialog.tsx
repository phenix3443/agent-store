import { useState } from 'react'
import type { ItemDetail } from '@as/types'
import { callRpc, errorText, RpcError } from '../../lib/rpc'
import { canForce } from '../../lib/installPolicy'
import { describeError, type FriendlyError } from '../../lib/errors'
import { AGENTS, joinNames } from '../../lib/agents'
import { useAppState } from '../../state/AppState'
import { useTerminalLog } from '../../state/TerminalLog'
import { useI18n } from '../../i18n'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Banner } from '../ui/states'
import { ErrorDetails, Steps } from './parts'

export type UninstallTarget = Pick<ItemDetail, 'slug' | 'category' | 'enabledFor'> & { name: string }

type Phase =
  | { kind: 'confirm'; item: UninstallTarget; running: boolean }
  | { kind: 'failed'; item: UninstallTarget; error: FriendlyError; forceable: boolean; running: boolean }

/** Confirm, then `aas uninstall`; a refusal that `--force` gets past offers 强制卸载. */
export function useUninstall(onDone: (slug: string) => void) {
  const { locale, t } = useI18n()
  const { bumpInstalledVersion } = useAppState()
  const { appendLine } = useTerminalLog()
  const [phase, setPhase] = useState<Phase | null>(null)

  async function run(item: UninstallTarget, force: boolean) {
    setPhase((p) => (p ? { ...p, running: true } : p))
    appendLine(`$ aas uninstall ${item.slug}${force ? ' --force' : ''}`)
    try {
      await callRpc('uninstall', force ? [item.slug, { force: true }] : [item.slug])
      appendLine(`✓ ${t('lib.uninstalledLog')} ${item.slug}`, 'green')
      setPhase(null)
      onDone(item.slug)
    } catch (err) {
      appendLine(`✗ ${errorText(err)}`, 'red')
      setPhase({
        kind: 'failed',
        item,
        error: describeError(err, t, 'uninstall'),
        forceable: !force && err instanceof RpcError && canForce(err.code),
        running: false,
      })
    }
    bumpInstalledVersion()
  }

  const on = phase ? AGENTS.filter((a) => phase.item.enabledFor[a.id]).map((a) => a.name) : []
  const names = joinNames(on, locale)

  function effects(item: UninstallTarget): string[] {
    if (item.category === 'skill') {
      return [t('un.skill1').replace('{0}', `~/.agent-store/skills/${item.slug}`), ...(on.length ? [t('un.skill2').replace('{0}', names)] : [])]
    }
    if (item.category === 'mcp') return [...(on.length ? [t('un.mcp1').replace('{0}', names)] : []), t('un.mcp2')]
    return [t('un.prov1'), ...(on.length ? [t('un.prov2').replace('{0}', names)] : [])]
  }

  const running = phase?.running ?? false
  const provider = phase?.item.category === 'provider'

  const dialog = (
    <Dialog open={phase !== null} onOpenChange={(open) => !open && !running && setPhase(null)}>
      <DialogContent aria-describedby={undefined} layer="top" data-kind={phase?.item.category}>
        <DialogBody>
          {phase?.kind === 'confirm' && (
            <>
              <DialogTitle>{t(provider ? 'un.titleProv' : 'un.title').replace('{0}', phase.item.name)}</DialogTitle>
              <p className="mb-3.5 text-[13px] text-fg-2">{t('un.lede')}</p>
              <Steps lines={effects(phase.item)} />
            </>
          )}
          {phase?.kind === 'failed' && (
            <>
              <DialogTitle>{t('policy.uninstallFailed')}</DialogTitle>
              <p className="my-2.5 break-all rounded-[9px] border border-line bg-code px-[11px] py-[9px] font-mono text-xs">{phase.item.slug}</p>
              <Banner tone="error">
                <p className="text-fg">{phase.error.message}</p>
                <ErrorDetails detail={phase.error.detail} />
              </Banner>
              {phase.forceable && <p className="mt-3 text-[13px] text-fg-2">{t('policy.forceHint')}</p>}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => setPhase(null)} disabled={running}>
            {phase?.kind === 'failed' && !phase.forceable ? t('ui.close') : t('common.cancel')}
          </Button>
          {phase?.kind === 'confirm' && (
            <Button variant="danger" disabled={running} onClick={() => void run(phase.item, false)}>
              {t(provider ? 'act.deleteCfg' : 'act.uninstall')}
            </Button>
          )}
          {phase?.kind === 'failed' && phase.forceable && (
            <Button variant="danger" disabled={running} onClick={() => void run(phase.item, true)}>
              {t('policy.forceUninstall')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { ask: (item: UninstallTarget) => setPhase({ kind: 'confirm', item, running: false }), dialog }
}
