import { useState } from 'react'
import { LayoutDashboard, ArrowLeftRight, Sparkles, Boxes } from 'lucide-react'
import { useAppState, type CategoryFilter } from '../state/AppState'
import { SettingsModal } from './SettingsModal'

const CATEGORY_ICONS: { value: Exclude<CategoryFilter, 'all'>; label: string; icon: typeof ArrowLeftRight }[] = [
  { value: 'provider', label: '供应商', icon: ArrowLeftRight },
  { value: 'skill', label: '技能', icon: Sparkles },
  { value: 'mcp', label: 'MCP', icon: Boxes },
]

function railButtonClass(active: boolean): string {
  return `flex h-9 w-9 items-center justify-center rounded-lg ${
    active ? 'bg-store-accent-soft text-store-accent' : 'text-store-text-2 hover:text-store-text'
  }`
}

export function IconRail() {
  const { navView, setNavView, categoryFilter, setCategoryFilter } = useAppState()
  const [settingsOpen, setSettingsOpen] = useState(false)

  function goToOverview() {
    setNavView('overview')
  }

  function goToCategory(value: Exclude<CategoryFilter, 'all'>) {
    setCategoryFilter(value)
    setNavView('browse')
  }

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-store-border bg-store-sidebar py-4">
      <button
        type="button"
        aria-label="概览"
        onClick={goToOverview}
        className={railButtonClass(navView === 'overview')}
      >
        <LayoutDashboard size={18} />
      </button>

      <div className="my-2 h-px w-8 bg-store-border" />

      {CATEGORY_ICONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          onClick={() => goToCategory(value)}
          className={railButtonClass(navView === 'browse' && categoryFilter === value)}
        >
          <Icon size={18} />
        </button>
      ))}

      <button
        type="button"
        aria-label="设置"
        onClick={() => setSettingsOpen(true)}
        className="mt-auto flex h-9 w-9 items-center justify-center rounded-full text-white"
        style={{ background: 'linear-gradient(135deg, #7c82ff, #4b4fc7)' }}
      >
        <span className="text-xs font-semibold">Y</span>
      </button>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  )
}
