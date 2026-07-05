import { useState } from 'react'
import type { ReactNode } from 'react'
import { useAppState, type CategoryFilter } from '../state/AppState'
import { SettingsModal } from './SettingsModal'

function OverviewIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function ProviderIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8.5h13l-3.2-3.2" />
      <path d="M20 15.5H7l3.2 3.2" />
    </svg>
  )
}

function SkillIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.6c.55 4.9 2.9 7.25 7.8 7.8-4.9.55-7.25 2.9-7.8 7.8-.55-4.9-2.9-7.25-7.8-7.8 4.9-.55 7.25-2.9 7.8-7.8Z" />
    </svg>
  )
}

function McpIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="6.4" rx="2" />
      <rect x="3" y="13.1" width="18" height="6.4" rx="2" />
      <path d="M6.6 7.7h.02" />
      <path d="M6.6 16.3h.02" />
    </svg>
  )
}

const CATEGORY_ICONS: { value: Exclude<CategoryFilter, 'all'>; label: string; icon: () => ReactNode }[] = [
  { value: 'provider', label: '供应商', icon: ProviderIcon },
  { value: 'skill', label: '技能', icon: SkillIcon },
  { value: 'mcp', label: 'MCP', icon: McpIcon },
]

function RailButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`relative flex h-[42px] w-[42px] items-center justify-center rounded-[11px] ${
        active ? 'bg-store-accent-soft text-store-accent' : 'text-store-text-2 hover:text-store-text'
      }`}
    >
      <span
        className={`absolute -left-2 top-[11px] h-5 w-[3px] rounded-r-[2px] ${
          active ? 'bg-store-accent' : 'bg-transparent'
        }`}
      />
      {children}
    </button>
  )
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
    <aside className="flex w-[58px] shrink-0 flex-col items-center gap-2 border-r border-store-border bg-store-sidebar py-4">
      <RailButton active={navView === 'overview'} label="概览" onClick={goToOverview}>
        <OverviewIcon />
      </RailButton>

      <div className="my-2 h-px w-8 bg-store-border" />

      {CATEGORY_ICONS.map(({ value, label, icon: Icon }) => (
        <RailButton
          key={value}
          active={navView === 'browse' && categoryFilter === value}
          label={label}
          onClick={() => goToCategory(value)}
        >
          <Icon />
        </RailButton>
      ))}

      <button
        type="button"
        aria-label="设置"
        onClick={() => setSettingsOpen(true)}
        className="mt-auto flex h-9 w-9 items-center justify-center rounded-full text-white"
        style={{ background: 'linear-gradient(135deg, #7c82ff, #b06ad9)' }}
      >
        <span className="text-xs font-semibold">Y</span>
      </button>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  )
}
