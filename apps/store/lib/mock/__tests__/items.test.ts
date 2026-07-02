import { test, expect } from 'bun:test'
import { MOCK_ITEMS, getItems, getItemBySlug, getFeaturedItems } from '../items'

test('MOCK_ITEMS covers all three categories', () => {
  const categories = new Set(MOCK_ITEMS.map((i) => i.category))
  expect(categories).toEqual(new Set(['provider', 'skill', 'mcp']))
})

test('getItems with no options returns all items', () => {
  expect(getItems({})).toHaveLength(MOCK_ITEMS.length)
})

test('getItems filters by category', () => {
  const result = getItems({ category: 'mcp' })
  expect(result.length).toBeGreaterThan(0)
  expect(result.every((i) => i.category === 'mcp')).toBe(true)
})

test('getItems filters by query across name/description/tags', () => {
  const result = getItems({ q: 'frontend' })
  expect(result.length).toBeGreaterThan(0)
})

test('getItems sorts by downloads descending by default', () => {
  const result = getItems({})
  for (let i = 1; i < result.length; i++) {
    expect(result[i - 1].downloads).toBeGreaterThanOrEqual(result[i].downloads)
  }
})

test('getItemBySlug returns the matching item', () => {
  const first = MOCK_ITEMS[0]
  expect(getItemBySlug(first.slug)?.id).toBe(first.id)
})

test('getItemBySlug returns null for unknown slug', () => {
  expect(getItemBySlug('does-not-exist')).toBeNull()
})

test('getFeaturedItems returns at most 6 items', () => {
  expect(getFeaturedItems().length).toBeLessThanOrEqual(6)
})
