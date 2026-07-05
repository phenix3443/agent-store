import type { InstalledItem, Item, ItemDetail } from '@aas/types'
import type { AgentApp, CategoryFilter, ListFilter } from '../state/AppState'

export function matchesCategoryFilter(category: Item['category'], filter: CategoryFilter): boolean {
  return filter === 'all' || category === filter
}

export function matchesText(name: string, description: string, query: string): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  return name.toLowerCase().includes(q) || description.toLowerCase().includes(q)
}

export interface EnrichedInstalledItem extends InstalledItem {
  name: string
  description: string
  publisher: ItemDetail['publisher']
  tags: string[]
  downloads: number
  rating: number
}

export function enrichInstalled(item: InstalledItem, detail: ItemDetail): EnrichedInstalledItem {
  return {
    ...item,
    name: detail.name,
    description: detail.description,
    publisher: detail.publisher,
    tags: detail.tags,
    downloads: detail.downloads,
    rating: 0,
  }
}

const INSTALLED_SECTION_FILTERS: ListFilter[] = ['all', 'installed', 'enabled', 'disabled', 'updates']
const RECOMMENDED_SECTION_FILTERS: ListFilter[] = ['all', 'featured', 'popular', 'recent', 'recommended']

export function showInstalledSection(filter: ListFilter): boolean {
  return INSTALLED_SECTION_FILTERS.includes(filter)
}

export function showRecommendedSection(filter: ListFilter): boolean {
  return RECOMMENDED_SECTION_FILTERS.includes(filter)
}

export function filterInstalledByListFilter(
  items: EnrichedInstalledItem[],
  filter: ListFilter,
  agentApp: AgentApp,
  updatableSlugs: Set<string> = new Set()
): EnrichedInstalledItem[] {
  if (filter === 'enabled') return items.filter((i) => !!i.enabledFor[agentApp])
  if (filter === 'disabled') return items.filter((i) => !i.enabledFor[agentApp])
  if (filter === 'updates') return items.filter((i) => updatableSlugs.has(i.slug))
  return items
}

export function filterRecommendedByListFilter(items: Item[], filter: ListFilter): Item[] {
  if (filter === 'popular') return [...items].sort((a, b) => b.downloads - a.downloads)
  if (filter === 'recent') {
    return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }
  return items
}
