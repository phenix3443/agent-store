import { test, expect, afterEach } from 'bun:test'
import { render, cleanup } from '@testing-library/react'
import { CategoryIcon } from '../CategoryIcon'

afterEach(() => cleanup())

test('renders a provider icon with the accent color tint', () => {
  const { container } = render(<CategoryIcon category="provider" />)
  const badge = container.firstElementChild as HTMLElement
  expect(badge.className).toContain('store-accent')
})

test('renders a skill icon with the green color tint', () => {
  const { container } = render(<CategoryIcon category="skill" />)
  const badge = container.firstElementChild as HTMLElement
  expect(badge.className).toContain('store-green')
})

test('renders an mcp icon with the amber color tint', () => {
  const { container } = render(<CategoryIcon category="mcp" />)
  const badge = container.firstElementChild as HTMLElement
  expect(badge.className).toContain('store-amber')
})

test('renders an svg icon inside the badge', () => {
  const { container } = render(<CategoryIcon category="provider" />)
  expect(container.querySelector('svg')).not.toBeNull()
})
