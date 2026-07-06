import type { Publisher } from '@as/types'

type TierVariant = Publisher['tier']
type CategoryVariant = 'provider' | 'skill' | 'mcp'
export type BadgeVariant = TierVariant | CategoryVariant

interface BadgeProps {
  variant: BadgeVariant
  children: React.ReactNode
}

const variantClasses: Record<BadgeVariant, string> = {
  official: 'bg-store-amber/10 text-store-amber border-store-amber/30',
  verified: 'bg-[#58a6f0]/10 text-[#58a6f0] border-[#58a6f0]/30',
  community: 'bg-store-text-3/10 text-store-text-2 border-store-text-3/30',
  provider: 'bg-[#58a6f0]/10 text-[#58a6f0] border-[#58a6f0]/30',
  skill: 'bg-store-green/10 text-store-green border-store-green/30',
  mcp: 'bg-store-amber/10 text-store-amber border-store-amber/30',
}

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  )
}
