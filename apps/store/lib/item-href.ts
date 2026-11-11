import type { Item } from '@as/types'

export function itemHref(item: Pick<Item, 'category' | 'slug'>): string {
  return `/store/${item.category}/${item.slug}`
}
