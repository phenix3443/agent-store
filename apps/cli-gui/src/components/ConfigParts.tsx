import type { ReactNode } from 'react'
import { useT } from '../i18n'
import type { ToolTarget } from '@as/types'

export const TARGET_LABEL: Record<ToolTarget, string> = { claude: 'Claude Code', codex: 'Codex' }

export interface TargetOption {
  target: ToolTarget
  enabled: boolean
  /** Why it can't be toggled now; shown as the button's tooltip. */
  disabledReason?: string
}

export function TargetPicker({
  options,
  busy,
  onToggle,
}: {
  options: TargetOption[]
  busy: boolean
  onToggle: (target: ToolTarget) => void
}) {
  return (
    <div className="flex gap-2">
      {options.map(({ target, enabled, disabledReason }) => (
        <button
          key={target}
          type="button"
          aria-label={TARGET_LABEL[target]}
          aria-pressed={enabled}
          disabled={busy || (!!disabledReason && !enabled)}
          title={disabledReason}
          onClick={() => onToggle(target)}
          className={`rounded-lg border px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled ? 'border-store-accent bg-store-accent-soft text-store-accent' : 'border-store-border text-store-text-2'
          }`}
        >
          {TARGET_LABEL[target]}
        </button>
      ))}
    </div>
  )
}

export function Banner({ tone, children }: { tone: 'warn' | 'error'; children: ReactNode }) {
  const error = tone === 'error'
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 ${
        error ? 'border-store-red bg-store-red-soft' : 'border-store-amber bg-store-amber-soft'
      }`}
    >
      <span className={error ? 'text-store-red' : 'text-store-amber'}>{error ? '✕' : '⚠'}</span>
      <div className="min-w-0 break-words text-[11.5px] text-store-text-2">{children}</div>
    </div>
  )
}

export interface PanelError {
  /** What failed, e.g. 启用 Claude Code 失败. */
  lead?: string
  message: string
  detail?: string
}

export function ErrorDetail({ detail }: { detail?: string }) {
  const t = useT()
  if (!detail) return null
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[10.5px] text-store-text-3 hover:text-store-text-2">{t('errors.details')}</summary>
      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10.5px] text-store-text-3">{detail}</pre>
    </details>
  )
}

/** Error above warning, spaced like the mockup's single banner (margin 0 28px 14px). */
export function Banners({ error, warn }: { error?: PanelError | null; warn?: string | null }) {
  if (!error && !warn) return null
  return (
    <div className="mx-7 my-3.5 flex flex-col gap-2">
      {error && (
        <Banner tone="error">
          {error.lead && <span className="font-semibold text-store-text">{error.lead}：</span>}
          {error.message}
          <ErrorDetail detail={error.detail} />
        </Banner>
      )}
      {warn && <Banner tone="warn">{warn}</Banner>}
    </div>
  )
}
