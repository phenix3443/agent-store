import { test, expect, afterEach, beforeEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { intlMock } from '../../test-intl'
import { cleanReview, flaggedReview, mcpItem, providerItem } from './fixtures'

mock.module('next/link', () => ({
  default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, back: () => {} }),
  usePathname: () => '/store',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('next-intl', () => intlMock)
mock.module('../ReviewsSection', () => ({ ReviewsSection: () => <section data-testid="reviews" /> }))

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

const { ItemDetail } = await import('../ItemDetail')
const { DetailDrawer } = await import('../DetailDrawer')
const { DrawerTitle } = await import('../DrawerTitle')
const { ClientStateProvider } = await import('../ClientStateProvider')

function renderPage(item = providerItem) {
  return render(<ItemDetail item={item} versions={[]} title={<h1>{item.name}</h1>} />)
}

function renderDrawer(onOpenChange: (open: boolean) => void = () => {}) {
  return render(
    <ClientStateProvider>
      <DetailDrawer item={providerItem} open onOpenChange={onOpenChange}>
        <ItemDetail item={providerItem} versions={[]} title={<DrawerTitle>{providerItem.name}</DrawerTitle>} />
      </DetailDrawer>
    </ClientStateProvider>
  )
}

test('the drawer and the page render the same detail: name, description, publisher tier', () => {
  for (const renderIt of [renderPage, renderDrawer]) {
    renderIt()
    expect(screen.getByText('OpenAI Provider')).toBeInTheDocument()
    expect(screen.getByText('OpenAI API provider with GPT-4o support')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'OpenAI' }).getAttribute('href')).toBe('/publisher/openai')
    expect(screen.getByText('官方')).toBeInTheDocument()
    expect(screen.getByText('安装后会执行')).toBeInTheDocument()
    cleanup()
  }
})

test('renders supported models for a provider item', () => {
  renderPage()
  expect(screen.getByText('gpt-4o')).toBeInTheDocument()
})

test('discloses what a stdio MCP server runs after install', () => {
  renderPage(mcpItem)
  expect(screen.getByText('npx -y @ankimcp/anki-mcp-server')).toBeInTheDocument()
})

test('no review data reads as pending and carries no stamp', () => {
  renderPage()
  expect(screen.getByText('待审')).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /审查章/ })).toBeNull()
})

test('a clean review carries the stamp and its summary', () => {
  renderPage({ ...providerItem, review: cleanReview })
  expect(screen.getByRole('img', { name: '审查章：已审，Agent Store' })).toBeInTheDocument()
  expect(screen.getByText(/Does what the manifest says\./)).toBeInTheDocument()
})

test('a flagged review lists its concerns and carries no stamp', () => {
  renderPage({ ...mcpItem, review: flaggedReview })
  expect(screen.getByText('有提醒')).toBeInTheDocument()
  expect(screen.getByText('Downloads and runs code through npx')).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /审查章/ })).toBeNull()
})

test('a package without ratings shows no score', () => {
  const { container } = renderPage()
  expect(container.textContent).not.toContain('0.0')
})

test('the primary action is install in the desktop client, with copy and download beside it', () => {
  renderPage()
  expect(screen.getByRole('button', { name: '在桌面客户端中安装' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '复制 OpenAI Provider 的安装命令' }).textContent).toBe('复制命令')
  expect(screen.getByRole('link', { name: '下载桌面客户端' }).getAttribute('href')).toBe('/download/latest')
  expect(screen.getByText('aas install openai-provider')).toBeInTheDocument()
})

test('the copy button beside the command confirms the copy', async () => {
  const writeText = mock(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: '复制 OpenAI Provider 的安装命令' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument())
  expect(writeText).toHaveBeenCalledWith('aas install openai-provider')
  expect(screen.getAllByRole('status').some((el) => el.textContent?.includes('已复制安装命令'))).toBe(true)
})

test('there is no "installed" state the web cannot confirm', () => {
  const { container } = renderPage()
  expect(container.textContent).not.toContain('已安装')
  expect(container.textContent).not.toContain('已装')
})

test('the drawer links to the full page and closes through onOpenChange', () => {
  const onOpenChange = mock(() => {})
  renderDrawer(onOpenChange)
  expect(screen.getByRole('link', { name: '展开为整页' }).getAttribute('href')).toBe('/store/provider/openai-provider')
  fireEvent.click(screen.getByLabelText('关闭详情'))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('the package name opens the header, with no category label above it', () => {
  renderPage(mcpItem)
  const heading = screen.getByRole('heading', { level: 1 })
  expect(heading.parentElement?.firstElementChild).toBe(heading)
})
