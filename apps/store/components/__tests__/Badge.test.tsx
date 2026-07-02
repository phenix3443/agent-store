import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { Badge } from '../Badge'

afterEach(() => { cleanup() })

test('Badge renders its children', () => {
  render(<Badge variant="official">official</Badge>)
  expect(screen.getByText('official')).toBeInTheDocument()
})

test('Badge applies official color class', () => {
  render(<Badge variant="official">official</Badge>)
  expect(screen.getByText('official').className).toContain('text-store-amber')
})

test('Badge applies verified color class', () => {
  render(<Badge variant="verified">verified</Badge>)
  expect(screen.getByText('verified').className).toContain('text-[#58a6f0]')
})

test('Badge applies secondary color for community', () => {
  render(<Badge variant="community">community</Badge>)
  expect(screen.getByText('community').className).toContain('text-store-text-2')
})

test('Badge applies muted style for category variants', () => {
  render(<Badge variant="provider">provider</Badge>)
  expect(screen.getByText('provider').className).toContain('text-[#58a6f0]')
})
