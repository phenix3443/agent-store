import { useState } from 'react'
import { Compass, RefreshCw, LayoutGrid, ArrowLeftRight, Sparkles, Boxes, Settings } from 'lucide-react'
import { useAppState, type CategoryFilter } from '../state/AppState'
import { SettingsModal } from './SettingsModal'

const CATEGORY_ICONS: { value: CategoryFilter; label: string; icon: typeof LayoutGrid }[] = [
  { value: 'all', label: '全部', icon: LayoutGrid },
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

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-store-border bg-store-sidebar py-4">
      <button
        type="button"
        aria-label="浏览商店"
        onClick={() => setNavView('browse')}
        className={railButtonClass(navView === 'browse')}
      >
        <Compass size={18} />
      </button>
      <button
        type="button"
        aria-label="更新"
        onClick={() => setNavView('updates')}
        className={railButtonClass(navView === 'updates')}
      >
        <RefreshCw size={18} />
      </button>

      <div className="my-2 h-px w-8 bg-store-border" />

      {CATEGORY_ICONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          onClick={() => setCategoryFilter(value)}
          className={railButtonClass(categoryFilter === value)}
        >
          <Icon size={18} />
        </button>
      ))}

      <button
        type="button"
        aria-label="设置"
        onClick={() => setSettingsOpen(true)}
        className="mt-auto flex h-9 w-9 items-center justify-center rounded-lg text-store-text-2 hover:text-store-text"
      >
        <Settings size={18} />
      </button>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  )
}
