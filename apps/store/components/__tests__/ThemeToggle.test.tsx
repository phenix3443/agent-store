import { test, expect, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ThemeToggle } from '../ThemeToggle'

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})
afterEach(() => { cleanup() })

test('defaults to dark theme', () => {
  render(<ThemeToggle />)
  expect(document.documentElement.dataset.theme).toBe('dark')
})

test('clicking toggles to light and back to dark', () => {
  render(<ThemeToggle />)
  const button = screen.getByRole('button')
  fireEvent.click(button)
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(localStorage.getItem('aas-store-theme')).toBe('light')
  fireEvent.click(button)
  expect(document.documentElement.dataset.theme).toBe('dark')
})
