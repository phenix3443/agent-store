import { Download, Compass, RefreshCw, Heart } from 'lucide-react'
import { useAppState, type Section } from '../state/AppState'

const SECTIONS: { value: Section; label: string; icon: typeof Download }[] = [
  { value: 'installed', label: '已安装', icon: Download },
  { value: 'browse', label: '浏览', icon: Compass },
  { value: 'updates', label: '更新', icon: RefreshCw },
  { value: 'favorites', label: '收藏', icon: Heart },
]

export function Sidebar() {
  const { section, setSection, agentApp, setAgentApp } = useAppState()

  return (
    <aside className="flex w-56 flex-col gap-4 border-r border-store-border bg-store-sidebar p-4">
      <nav className="flex flex-col gap-1">
        {SECTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setSection(value)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              section === value ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2 hover:text-store-text'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex gap-1 rounded-lg border border-store-border bg-store-panel p-1">
        <button
          type="button"
          onClick={() => setAgentApp('claude')}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs ${
            agentApp === 'claude' ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'
          }`}
        >
          Claude Code
        </button>
        <button
          type="button"
          onClick={() => setAgentApp('codex')}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs ${
            agentApp === 'codex' ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'
          }`}
        >
          Codex
        </button>
      </div>
    </aside>
  )
}
