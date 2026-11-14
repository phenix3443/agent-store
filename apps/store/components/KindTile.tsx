import type { ResourceKind } from '@as/types'
import { Layers, Network, Server } from 'lucide-react'

const ICONS = { skill: Layers, mcp: Network, provider: Server } as const

export function KindTile({ kind, className = '', size = 20 }: { kind: ResourceKind; className?: string; size?: number }) {
  const Icon = ICONS[kind]
  return (
    <span aria-hidden data-kind={kind} className={`kind-tile ${className}`}>
      <Icon size={size} strokeWidth={1.8} />
    </span>
  )
}
