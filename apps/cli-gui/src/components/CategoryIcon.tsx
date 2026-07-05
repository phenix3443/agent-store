import { ArrowLeftRight, Sparkles, Boxes } from 'lucide-react'

type Category = 'provider' | 'skill' | 'mcp'

const CATEGORY_CONFIG: Record<Category, { icon: typeof ArrowLeftRight; bgClass: string; textClass: string }> = {
  provider: { icon: ArrowLeftRight, bgClass: 'bg-store-provider-soft', textClass: 'text-store-provider' },
  skill: { icon: Sparkles, bgClass: 'bg-store-green-soft', textClass: 'text-store-green' },
  mcp: { icon: Boxes, bgClass: 'bg-store-amber-soft', textClass: 'text-store-amber' },
}

export function CategoryIcon({ category, size = 'md' }: { category: Category; size?: 'sm' | 'md' }) {
  const { icon: Icon, bgClass, textClass } = CATEGORY_CONFIG[category]
  const boxClass = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
  const iconSize = size === 'sm' ? 14 : 16

  return (
    <div className={`flex ${boxClass} shrink-0 items-center justify-center rounded-lg ${bgClass} ${textClass}`}>
      <Icon size={iconSize} />
    </div>
  )
}
