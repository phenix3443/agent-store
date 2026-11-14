import type { ReactNode } from 'react'
import { ExternalLink, Lock } from 'lucide-react'
import { useEntitlement, type ProFeature } from '../state/Entitlement'
import { useT } from '../i18n'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

/** Small inline "Pro" tag for labelling gated controls. */
export function ProBadge() {
  return <Badge tone="pro">Pro</Badge>
}

interface ProGateProps {
  feature: ProFeature
  /** The gated content, shown only when the plan unlocks `feature`. */
  children: ReactNode
  /** Short description of what the feature does, shown in the upsell card. */
  title: string
  description?: string
  /** Invoked when the user clicks the upgrade CTA. Omit to hide the button. */
  onUpgrade?: () => void
  upgradeBusy?: boolean
}

/** Renders `children` when the current plan unlocks `feature`; otherwise shows an upsell card in its place. */
export function ProGate({ feature, children, title, description, onUpgrade, upgradeBusy }: ProGateProps) {
  const t = useT()
  const { has } = useEntitlement()
  if (has(feature)) return <>{children}</>

  return (
    <div className="grid justify-items-center gap-1.5 rounded-box border border-dashed border-skill/40 bg-skill/[0.04] px-4 py-5 text-center">
      <b className="flex items-center gap-2 text-[13.5px] font-bold">
        <Lock size={15} className="text-fg-2" />
        {title}
        <ProBadge />
      </b>
      {description && <p className="max-w-[52ch] text-xs text-fg-3">{description}</p>}
      {onUpgrade && (
        <Button size="sm" className="mt-1.5" onClick={onUpgrade} disabled={upgradeBusy}>
          {t('extra.upgradeCta')}
          <ExternalLink />
        </Button>
      )}
    </div>
  )
}
