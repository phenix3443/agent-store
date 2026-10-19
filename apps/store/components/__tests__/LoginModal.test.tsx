import { afterEach, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

import { LoginModal } from '../LoginModal'

afterEach(() => cleanup())

test('uses accurate login copy and links to the legal pages', () => {
  render(<LoginModal open onOpenChange={() => {}} />)

  const text = document.body.textContent ?? ''
  expect(text).not.toContain('跨设备同步')
  expect(text).not.toContain('跨端同步')
  expect(screen.getByRole('link', { name: '服务条款' })).toHaveAttribute('href', '/terms')
  expect(screen.getByRole('link', { name: '隐私政策' })).toHaveAttribute('href', '/privacy')
})
