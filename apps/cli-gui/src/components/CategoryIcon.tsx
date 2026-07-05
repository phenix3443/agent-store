import type { ReactNode } from 'react'
import { ArrowLeftRight, Sparkles, Boxes } from 'lucide-react'

type Category = 'provider' | 'skill' | 'mcp'
type Size = 'sm' | 'md' | 'xl'

const CATEGORY_CONFIG: Record<Category, { icon: typeof ArrowLeftRight; bgClass: string; textClass: string }> = {
  provider: { icon: ArrowLeftRight, bgClass: 'bg-store-provider-soft', textClass: 'text-store-provider' },
  skill: { icon: Sparkles, bgClass: 'bg-store-green-soft', textClass: 'text-store-green' },
  mcp: { icon: Boxes, bgClass: 'bg-store-amber-soft', textClass: 'text-store-amber' },
}

const SIZE_CONFIG: Record<Size, { boxClass: string; iconSize: number }> = {
  sm: { boxClass: 'h-7 w-7 rounded-lg', iconSize: 14 },
  md: { boxClass: 'h-9 w-9 rounded-lg', iconSize: 16 },
  xl: { boxClass: 'h-[84px] w-[84px] rounded-[20px]', iconSize: 40 },
}

// Real glyph paths ported from the mockup's `icon()` method (same paths used by IconRail),
// used for the 84x84 detail-header icon where a literal shape match matters more than for
// the small list-row badges (which reuse the lucide substitutes shipped in an earlier task).
function ProviderGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8.5h13l-3.2-3.2" />
      <path d="M20 15.5H7l3.2 3.2" />
    </svg>
  )
}

function SkillGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.6c.55 4.9 2.9 7.25 7.8 7.8-4.9.55-7.25 2.9-7.8 7.8-.55-4.9-2.9-7.25-7.8-7.8 4.9-.55 7.25-2.9 7.8-7.8Z" />
    </svg>
  )
}

function McpGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="6.4" rx="2" />
      <rect x="3" y="13.1" width="18" height="6.4" rx="2" />
      <path d="M6.6 7.7h.02" />
      <path d="M6.6 16.3h.02" />
    </svg>
  )
}

const GLYPHS: Record<Category, (size: number) => ReactNode> = {
  provider: (size) => <ProviderGlyph size={size} />,
  skill: (size) => <SkillGlyph size={size} />,
  mcp: (size) => <McpGlyph size={size} />,
}

export function CategoryIcon({ category, size = 'md' }: { category: Category; size?: Size }) {
  const { icon: Icon, bgClass, textClass } = CATEGORY_CONFIG[category]
  const { boxClass, iconSize } = SIZE_CONFIG[size]

  return (
    <div className={`flex ${boxClass} shrink-0 items-center justify-center ${bgClass} ${textClass}`}>
      {size === 'xl' ? GLYPHS[category](iconSize) : <Icon size={iconSize} />}
    </div>
  )
}
