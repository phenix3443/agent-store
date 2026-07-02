import { describe, test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(() => { cleanup() })

mock.module('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))
mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/store',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => key.split('.').pop() ?? key,
}))

const { default: StorePage } = await import('../page')
const { ClientStateProvider } = await import('../../../components/ClientStateProvider')

describe('StorePage', () => {
  test('renders items from the mock catalog', async () => {
    render(<ClientStateProvider>{await StorePage({ searchParams: {} })}</ClientStateProvider>)
    expect(screen.getByText('Superpowers')).toBeInTheDocument()
  })

  test('filters by category search param', async () => {
    render(
      <ClientStateProvider>
        {await StorePage({ searchParams: { category: 'mcp' } })}
      </ClientStateProvider>
    )
    expect(screen.getByText('Filesystem MCP')).toBeInTheDocument()
    expect(screen.queryByText('Superpowers')).not.toBeInTheDocument()
  })
})
