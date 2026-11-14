import { useState } from 'react'
import type { ToolTarget } from '@as/types'
import { callRpc, errorText, RpcError } from '../../lib/rpc'
import { describeError, type FriendlyError } from '../../lib/errors'
import { TARGET_LABEL } from '../../lib/agents'
import { useAppState } from '../../state/AppState'
import { useTerminalLog } from '../../state/TerminalLog'
import { useT } from '../../i18n'

export interface ToggleFailure extends FriendlyError {
  slug: string
  target: ToolTarget
  lead: string
  /** Enabling again with `force` gets past it (a skill folder Agent Store did not put there). */
  forceable: boolean
}

const SKILL_FORCEABLE = new Set(['SkillDeployRefusedError', 'SkillConflictError'])

/** Enable / disable one installed entry for one agent, the way `aas enable|disable <slug> --for <agent>` does. */
export function useTargetToggle() {
  const t = useT()
  const { bumpInstalledVersion } = useAppState()
  const { appendLine } = useTerminalLog()
  const [busy, setBusy] = useState<string | null>(null)
  const [failure, setFailure] = useState<ToggleFailure | null>(null)

  async function toggle(slug: string, target: ToolTarget, enabled: boolean, force = false): Promise<ToggleFailure | null> {
    const action = enabled && !force ? 'disable' : 'enable'
    setBusy(`${slug}:${target}`)
    appendLine(`$ aas ${action} ${slug} --for ${target}${force ? ' --force' : ''}`)
    let result: ToggleFailure | null = null
    try {
      await callRpc(action, force ? [slug, target, { force: true }] : [slug, target])
      appendLine(`✓ ${t(action === 'enable' ? 'lib.enabledLog' : 'lib.disabledLog').replace('{0}', TARGET_LABEL[target])} ${slug}`, 'green')
      setFailure(null)
    } catch (err) {
      appendLine(`✗ ${errorText(err)}`, 'red')
      const code = err instanceof RpcError ? err.code : undefined
      result = {
        slug,
        target,
        lead: t(action === 'enable' ? 'policy.enableFailed' : 'policy.disableFailed').replace('{tool}', TARGET_LABEL[target]),
        ...describeError(err, t),
        forceable: action === 'enable' && !force && code !== undefined && SKILL_FORCEABLE.has(code),
      }
      setFailure(result)
    } finally {
      setBusy(null)
      bumpInstalledVersion()
    }
    return result
  }

  return { busy, failure, toggle, dismiss: () => setFailure(null) }
}

export type TargetToggle = ReturnType<typeof useTargetToggle>
