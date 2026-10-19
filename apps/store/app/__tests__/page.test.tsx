import { afterEach, expect, mock, test } from 'bun:test'
import { cleanup, render } from '@testing-library/react'

afterEach(() => cleanup())

mock.module('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

const { getFeaturedItems, getItems } = await import('../../lib/mock/items')
mock.module('@/lib/catalog', () => ({
  getFeaturedItems: async () => getFeaturedItems(),
  getItems: async (options: Parameters<typeof getItems>[0]) => getItems(options),
}))

const { default: LandingPage } = await import('../page')

test('does not advertise unimplemented cross-device synchronization', async () => {
  const view = render(await LandingPage())
  const text = view.container.textContent ?? ''

  expect(text).not.toContain('跨设备同步')
  expect(text).not.toContain('跨端同步')
  expect(text).not.toContain('cross-device sync')
})
