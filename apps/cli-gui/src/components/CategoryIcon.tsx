import { Glyph } from './ui/icons'

type Category = 'provider' | 'skill' | 'mcp'
type Size = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CONFIG: Record<Size, { box: string; icon: string }> = {
  sm: { box: 'h-7 w-7 rounded-lg', icon: 'h-3.5 w-3.5' },
  md: { box: 'h-9 w-9 rounded-ctl', icon: 'h-[18px] w-[18px]' },
  lg: { box: 'h-12 w-12 rounded-[13px] shadow-[0_6px_22px_rgb(var(--kind-rgb)/0.18)]', icon: 'h-6 w-6' },
  xl: { box: 'h-[84px] w-[84px] rounded-[20px] shadow-[0_6px_22px_rgb(var(--kind-rgb)/0.18)]', icon: 'h-10 w-10' },
}

/** Category tile: the category color is its only meaning. */
export function CategoryIcon({ category, size = 'md' }: { category: Category; size?: Size }) {
  const { box, icon } = SIZE_CONFIG[size]
  return (
    <div
      data-kind={category}
      className={`flex ${box} shrink-0 items-center justify-center border border-kind/35 bg-gradient-to-b from-kind/25 to-kind/5 text-kind`}
    >
      <Glyph name={category} className={icon} />
    </div>
  )
}
