import type { ReactNode } from 'react'
import { Lock, Sparkles } from 'lucide-react'
import { useEntitlement, type ProFeature } from '../state/Entitlement'
import { useT } from '../i18n'

/** Small inline "Pro" tag for labelling gated controls. */
export function ProBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-store-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-store-accent">
      <Sparkles size={10} />
      Pro
    </span>
  )
}

interface ProGateProps {
  feature: ProFeature
  /** The gated content, shown only when the plan unlocks `feature`. */
  children: ReactNode
  /** Short description of what the feature does, shown in the upsell card. */
  title: string
  description?: string
  /** Invoked when the user clicks the upgrade CTA. Omit to hide the button (until billing is wired). */
  onUpgrade?: () => void
}

/** Renders `children` when the current plan unlocks `feature`; otherwise shows an upsell card in its place. */
export function ProGate({ feature, children, title, description, onUpgrade }: ProGateProps) {
  const t = useT()
  const { has } = useEntitlement()
  if (has(feature)) return <>{children}</>

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-store-border bg-store-panel p-6 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-store-accent-soft text-store-accent">
        <Lock size={16} />
      </div>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-store-text">{title}</p>
        <ProBadge />
      </div>
      {description && <p className="max-w-sm text-xs text-store-text-2">{description}</p>}
      {onUpgrade && (
        <button
          type="button"
          onClick={onUpgrade}
          className="mt-1 rounded-md bg-store-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          {t('extra.upgradeCta')}
        </button>
      )}
    </div>
  )
}
