import { test, expect, afterEach } from 'bun:test'
import { render, cleanup } from '@testing-library/react'
import { CategoryIcon } from '../CategoryIcon'

afterEach(() => cleanup())

for (const category of ['provider', 'skill', 'mcp'] as const) {
  test(`a ${category} tile takes the ${category} category color`, () => {
    const { container } = render(<CategoryIcon category={category} />)
    const tile = container.firstElementChild as HTMLElement
    expect(tile.getAttribute('data-kind')).toBe(category)
    expect(tile.className).toContain('text-kind')
  })
}

test('renders an svg icon inside the tile', () => {
  const { container } = render(<CategoryIcon category="provider" />)
  expect(container.querySelector('svg')).not.toBeNull()
})
