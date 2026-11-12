import { useEffect, useState } from 'react'
import type { TargetStatus, ToolTarget } from '@as/types'
import { callRpc, RpcError } from '../lib/rpc'
import { describeError } from '../lib/errors'
import { useT } from '../i18n'
import { Banner, ErrorDetail, TargetPicker, TARGET_LABEL } from './ConfigParts'

interface Failure {
  target: ToolTarget
  lead: string
  message: string
  detail?: string
  /** The refusal is about something in the tool's folder that --force replaces. */
  forceable: boolean
}

/**
 * The 适用客户端 picker of the config pages, for an installed skill: each tool
 * has its own deployment, switched on and off here.
 */
export function SkillTargets({ slug, onChange }: { slug: string; onChange?: () => void }) {
  const t = useT()
  const [status, setStatus] = useState<TargetStatus[]>([])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  async function refresh() {
    setStatus(await callRpc<TargetStatus[]>('getTargetStatus', [slug]))
  }

  useEffect(() => {
    setFailure(null)
    refresh().catch(() => setStatus([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  async function toggle(target: ToolTarget, force = false) {
    const enabled = status.find((s) => s.target === target)?.enabled ?? false
    const action = enabled && !force ? 'disable' : 'enable'
    setBusy(true)
    try {
      await callRpc(action, force ? [slug, target, { force: true }] : [slug, target])
      setFailure(null)
    } catch (err) {
      const code = err instanceof RpcError ? err.code : undefined
      setFailure({
        target,
        lead: t(action === 'enable' ? 'policy.enableFailed' : 'policy.disableFailed').replace('{tool}', TARGET_LABEL[target]),
        ...describeError(err, t),
        forceable: action === 'enable' && (code === 'SkillDeployRefusedError' || code === 'SkillConflictError'),
      })
    } finally {
      await refresh().catch(() => undefined)
      setBusy(false)
      onChange?.()
    }
  }

  if (status.length === 0) return null
  return (
    <div className="mt-4 max-w-[620px]">
      <p className="mb-1.5 text-[11px] font-semibold text-store-text-2">{t('catalog.skillClients')}</p>
      <TargetPicker
        options={status.map((s) => ({
          target: s.target,
          enabled: s.enabled,
          disabledReason: s.blocker?.reason === 'incompatible' ? t('policy.unsupported') : undefined,
        }))}
        busy={busy}
        onToggle={(target) => void toggle(target)}
      />
      {failure && (
        <div className="mt-2">
          <Banner tone="error">
            <span className="font-semibold text-store-text">{failure.lead}：</span>
            {failure.message}
            <ErrorDetail detail={failure.detail} />
            {failure.forceable && (
              <button
                type="button"
                onClick={() => void toggle(failure.target, true)}
                disabled={busy}
                className="mt-2 block rounded-md border border-store-red px-2.5 py-1 text-[11px] font-semibold text-store-red hover:bg-store-red-soft disabled:opacity-50"
              >
                {t('catalog.forceEnable')}
              </button>
            )}
          </Banner>
        </div>
      )}
    </div>
  )
}
