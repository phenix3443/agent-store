import { formatPrice } from '@as/types'

export interface DocSection {
  id: string
  title: string
  body: string
  bullets?: string[]
  code?: string
}

export type ArticleId = 'install' | 'browse' | 'relay' | 'cli' | 'plans'

export const ARTICLES: { id: ArticleId; kind: 'skill' | 'mcp' | 'provider'; sections: string[] }[] = [
  { id: 'install', kind: 'skill', sections: ['install'] },
  { id: 'browse', kind: 'mcp', sections: ['browse', 'where'] },
  { id: 'relay', kind: 'provider', sections: ['relay', 'levels', 'usage'] },
  { id: 'cli', kind: 'mcp', sections: ['cli'] },
  { id: 'plans', kind: 'skill', sections: ['pro', 'plans'] },
]

/** The section that the docs index shows on its own, not inside an article. */
export const ABOUT_SECTION = 'about'

export function articleFor(sectionId: string): ArticleId | undefined {
  return ARTICLES.find((a) => a.sections.includes(sectionId))?.id
}

const PRICES: Record<string, string> = {
  monthly: formatPrice('monthly'),
  yearly: formatPrice('yearly'),
  lifetime: formatPrice('lifetime'),
}

// Message arrays come back raw, so prices are filled in here.
export const fillPrices = (text: string) =>
  text.replace(/\{(monthly|yearly|lifetime)\}/g, (_, key: string) => PRICES[key] ?? key)
