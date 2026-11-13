import { test, expect, afterEach, beforeEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { intlMock } from '../../test-intl'
import { mcpResource, providerResource, skillResource } from './fixtures'

mock.module('next/link', () => ({
  default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, back: () => {} }),
  usePathname: () => '/store',
  useSearchParams: () => new URLSearchParams(),
  // bun shares module mocks between files, so every mock exposes what any page imports.
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: () => {
    throw new Error('NEXT_REDIRECT')
  },
}))
mock.module('next-intl', () => intlMock)

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

const { ItemDetail } = await import('../ItemDetail')
const { DetailDrawer } = await import('../DetailDrawer')
const { DrawerTitle } = await import('../DrawerTitle')
const { ClientStateProvider } = await import('../ClientStateProvider')

function renderPage(resource: Parameters<typeof ItemDetail>[0]['resource'] = providerResource) {
  return render(<ItemDetail resource={resource} title={<h1>{resource.name}</h1>} />)
}

function renderDrawer(onOpenChange: (open: boolean) => void = () => {}) {
  return render(
    <ClientStateProvider>
      <DetailDrawer resource={skillResource} open onOpenChange={onOpenChange}>
        <ItemDetail resource={skillResource} title={<DrawerTitle>{skillResource.name}</DrawerTitle>} />
      </DetailDrawer>
    </ClientStateProvider>
  )
}

test('the drawer and the page render the same detail: name, description, author without internal catalog sources', () => {
  for (const renderIt of [() => renderPage(skillResource), () => renderDrawer()]) {
    renderIt()
    expect(screen.getByText('brainstorming')).toBeInTheDocument()
    expect(screen.getByText('Explore intent before building. Use it before any creative work.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'obra' }).getAttribute('href')).toBe('https://github.com/obra')
    expect(screen.queryByText('GitHub · skills.sh')).toBeNull()
    expect(screen.queryByText('上游标识')).toBeNull()
    expect(screen.getByText('12.4K 次安装')).toBeInTheDocument()
    expect(screen.getByText('GitHub 星标 152.3K')).toBeInTheDocument()
    expect(screen.getByText('安装后会执行')).toBeInTheDocument()
    cleanup()
  }
})

test('a skill shows its GitHub directory and marks executable files', () => {
  renderPage(skillResource)
  expect(screen.getByRole('link', { name: 'obra/superpowers/skills/brainstorming' }).getAttribute('href')).toBe(skillResource.repo.url)
  expect(screen.getByText('scripts/run.sh')).toBeInTheDocument()
  expect(screen.getByText('可执行')).toBeInTheDocument()
  expect(screen.getByText('npx skills add obra/superpowers --skill brainstorming')).toBeInTheDocument()
})

test('an MCP server discloses its launch and the values it needs', () => {
  renderPage(mcpResource)
  expect(screen.getByText('npx -y @ankimcp/anki-mcp-server@0.8.0')).toBeInTheDocument()
  expect(screen.getByText('ANKI_TOKEN')).toBeInTheDocument()
  expect(
    screen.getByText('claude mcp add -e ANKI_TOKEN=<ANKI_TOKEN> anki-mcp-server -- npx -y @ankimcp/anki-mcp-server@0.8.0')
  ).toBeInTheDocument()
  expect(screen.queryByText('已验证')).toBeNull()
})

test('a provider shows its endpoint, models and the verified mark, and no install count', () => {
  const { container } = renderPage()
  expect(screen.getByText('https://openrouter.ai/api')).toBeInTheDocument()
  expect(screen.getByText('anthropic/claude-sonnet-4')).toBeInTheDocument()
  expect(screen.getByText('已验证')).toBeInTheDocument()
  expect(container.textContent).not.toContain('次安装')
  expect(container.textContent).not.toContain('星标')
})

test('an MCP server shows its GitHub stars', () => {
  renderPage(mcpResource)
  expect(screen.getByText('GitHub 星标 1.3K')).toBeInTheDocument()
})

test('an entry gone upstream says so', () => {
  renderPage({ ...mcpResource, origin: { ...mcpResource.origin, unavailableAt: '2026-11-11T00:00:00Z' } })
  expect(screen.getByRole('note').textContent).toContain('这个包已下架')
})

test('an MCP record with nothing to install explains instead of showing a command', () => {
  renderPage({ ...mcpResource, packages: [], remotes: [] })
  expect(screen.getByText('这个条目没有列出可安装的包或远程地址。')).toBeInTheDocument()
  expect(screen.getByText(/没有能转成安装命令的包或远程地址/)).toBeInTheDocument()
})

test('there is no review verdict, score or version history', () => {
  const { container } = renderPage(mcpResource)
  expect(screen.queryByText('待审')).toBeNull()
  expect(screen.queryByText('用户评价')).toBeNull()
  expect(screen.queryByText('版本历史')).toBeNull()
  expect(container.textContent).not.toContain('0.0')
})

test('the primary action is install in the desktop client, with copy and download beside it', () => {
  renderPage()
  expect(screen.getByRole('button', { name: '在桌面客户端中安装' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '复制 OpenRouter 的安装命令' }).textContent).toBe('复制命令')
  expect(screen.getByRole('link', { name: '下载桌面客户端' }).getAttribute('href')).toBe('/download')
  expect(screen.getByText('aas install openrouter')).toBeInTheDocument()
})

test('the copy button beside the command confirms the copy', async () => {
  const writeText = mock(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: '复制 OpenRouter 的安装命令' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument())
  expect(writeText).toHaveBeenCalledWith('aas install openrouter')
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
  expect(screen.getByRole('link', { name: '展开为整页' }).getAttribute('href')).toBe('/store/skill/github:obra/superpowers/brainstorming')
  fireEvent.click(screen.getByLabelText('关闭详情'))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('the package name opens the header, with no category label above it', () => {
  renderPage(mcpResource)
  const heading = screen.getByRole('heading', { level: 1 })
  expect(heading.parentElement?.firstElementChild).toBe(heading)
})

test('a semver version gets a "v", a skill\'s tree sha does not', () => {
  renderPage(skillResource)
  expect(screen.getByText('76a98a285cb0')).toBeInTheDocument()
  cleanup()
  renderPage()
  expect(screen.getByText('v1.0.0')).toBeInTheDocument()
})
