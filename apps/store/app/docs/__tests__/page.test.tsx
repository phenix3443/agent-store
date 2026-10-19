import { afterEach, expect, test } from 'bun:test'
import { cleanup, render } from '@testing-library/react'

import DocsPage from '../page'

afterEach(() => cleanup())

test('does not advertise unimplemented cross-device synchronization', () => {
  const view = render(<DocsPage />)
  const text = view.container.textContent ?? ''

  expect(text).not.toContain('跨设备同步')
  expect(text).not.toContain('跨端同步')
})
