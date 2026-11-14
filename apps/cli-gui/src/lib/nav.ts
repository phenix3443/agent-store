import type { CategoryFilter, NavView } from '../state/AppState'
import type { GlyphName } from '../components/ui/icons'

export type Section = 'discover' | 'skills' | 'mcp' | 'providers' | 'usage' | 'settings'

/** Order matters: it is the ⌘1–⌘6 / Ctrl+1–Ctrl+6 order. */
export const SECTIONS: { id: Section; icon: GlyphName; kind?: 'skill' | 'mcp' | 'provider' }[] = [
  { id: 'discover', icon: 'discover' },
  { id: 'skills', icon: 'skill', kind: 'skill' },
  { id: 'mcp', icon: 'mcp', kind: 'mcp' },
  { id: 'providers', icon: 'provider', kind: 'provider' },
  { id: 'usage', icon: 'usage' },
  { id: 'settings', icon: 'settings' },
]

// The local sections still open the existing resource list filtered by category; #164 and #165
// replace them with their own pages.
const TARGETS: Record<Section, { view: NavView; category?: CategoryFilter }> = {
  discover: { view: 'browse', category: 'all' },
  skills: { view: 'browse', category: 'skill' },
  mcp: { view: 'browse', category: 'mcp' },
  providers: { view: 'browse', category: 'provider' },
  usage: { view: 'overview' },
  settings: { view: 'settings' },
}

export function sectionTarget(section: Section) {
  return TARGETS[section]
}

export function currentSection(view: NavView, category: CategoryFilter): Section {
  if (view === 'overview') return 'usage'
  if (view === 'settings') return 'settings'
  if (category === 'skill') return 'skills'
  if (category === 'mcp') return 'mcp'
  if (category === 'provider') return 'providers'
  return 'discover'
}

export function isMacPlatform(): boolean {
  try {
    return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  } catch {
    return false
  }
}

export function modKeyLabel(): string {
  return isMacPlatform() ? '⌘' : 'Ctrl'
}
