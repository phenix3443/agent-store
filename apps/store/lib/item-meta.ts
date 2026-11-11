import type { Item, Publisher } from '@as/types'

type Category = Item['category']
type Tier = Publisher['tier']

// Mirrors the design mockup's TYPE map (Agent Store.dc.html): per-category label,
// accent color and soft background used for the icon tile and type-label chip.
export const CATEGORY_META: Record<Category, { label: string; color: string; soft: string }> = {
  provider: { label: '供应商', color: '#58a6f0', soft: 'rgba(88, 166, 240, 0.16)' },
  skill: { label: '技能', color: '#3ad29f', soft: 'rgba(58, 210, 159, 0.16)' },
  mcp: { label: 'MCP', color: '#f0b34a', soft: 'rgba(240, 179, 74, 0.16)' },
}

// Mirrors the design mockup's TIERS map: publisher tier label + pill colors.
export const TIER_META: Record<Tier, { label: string; color: string; soft: string }> = {
  official: { label: '官方', color: '#f0b34a', soft: 'rgba(240, 179, 74, 0.18)' },
  verified: { label: '已验证', color: '#58a6f0', soft: 'rgba(88, 166, 240, 0.18)' },
  community: { label: '社区', color: '#8b8b96', soft: 'rgba(139, 139, 150, 0.16)' },
}

// Category glyphs from the mockup's icon() helper — 1em, currentColor driven.
export function CategoryGlyph({ category, className }: { category: Category; className?: string }) {
  const common = {
    viewBox: '0 0 24 24',
    width: '1em',
    height: '1em',
    fill: category === 'skill' ? 'currentColor' : 'none',
    stroke: category === 'skill' ? 'none' : 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  }
  if (category === 'provider') {
    return (
      <svg {...common}>
        <path d="M4 8.5h13l-3.2-3.2" />
        <path d="M20 15.5H7l3.2 3.2" />
      </svg>
    )
  }
  if (category === 'skill') {
    return (
      <svg {...common}>
        <path d="M12 2.6c.55 4.9 2.9 7.25 7.8 7.8-4.9.55-7.25 2.9-7.8 7.8-.55-4.9-2.9-7.25-7.8-7.8 4.9-.55 7.25-2.9 7.8-7.8Z" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <rect x="3" y="4.5" width="18" height="6.4" rx="2" />
      <rect x="3" y="13.1" width="18" height="6.4" rx="2" />
      <path d="M6.6 7.7h.02" />
      <path d="M6.6 16.3h.02" />
    </svg>
  )
}

// Compact download formatting matching the design (e.g. 142k, 1.2M).
export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
