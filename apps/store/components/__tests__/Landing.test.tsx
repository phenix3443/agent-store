import { test, expect, mock, afterEach } from 'bun:test'
import { act, render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { intlMock } from '../../test-intl'
import { parseRelease } from '../../lib/latest-release'

mock.module('next/link', () => ({
  default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next-intl', () => intlMock)

afterEach(() => { cleanup() })

const { InstallMap } = await import('../landing/InstallMap')
const { TerminalDemo } = await import('../landing/TerminalDemo')
const { TERMINAL_SESSIONS } = await import('../landing/terminal-sessions')
const { Faq, FAQ_KEYS } = await import('../landing/Faq')
const { DownloadSection } = await import('../landing/DownloadSection')
const { HeroDownload } = await import('../landing/HeroDownload')

const samples = {
  skill: { name: 'Brainstorming', slug: 'superpowers-brainstorming', tools: ['claude', 'codex'] },
  mcp: { name: 'Context7', slug: 'context7', tools: ['claude', 'codex'] },
  provider: { name: 'OpenRouter', slug: 'openrouter', tools: ['codex'] },
} satisfies Record<string, { name: string; slug: string; tools: ('claude' | 'codex')[] }>

test('install map starts on skills and shows where a skill lands for each tool', () => {
  render(<InstallMap samples={samples} />)
  const panel = screen.getByRole('tabpanel')
  expect(screen.getByRole('tab', { name: '技能' }).getAttribute('aria-selected')).toBe('true')
  expect(panel.textContent).toContain('aas install superpowers-brainstorming')
  expect(panel.textContent).toContain('~/.claude/skills/superpowers-brainstorming')
  expect(panel.textContent).toContain('~/.agents/skills/superpowers-brainstorming/')
})

// Radix's RovingFocusGroup moves focus on arrow keys in a setTimeout, so wait for it.
test('install map switches with the arrow keys and only shows the tools a package supports', async () => {
  render(<InstallMap samples={samples} />)
  const skill = screen.getByRole('tab', { name: '技能' })
  act(() => skill.focus())
  fireEvent.keyDown(skill, { key: 'ArrowRight' })
  const mcp = screen.getByRole('tab', { name: 'MCP' })
  await waitFor(() => expect(mcp).toHaveFocus())
  expect(mcp.getAttribute('aria-selected')).toBe('true')
  expect(screen.getByRole('tabpanel').textContent).toContain('mcpServers.context7')
  expect(screen.getByRole('tabpanel').textContent).toContain('[mcp_servers.context7]')

  fireEvent.keyDown(mcp, { key: 'ArrowRight' })
  const provider = screen.getByRole('tab', { name: '供应商' })
  await waitFor(() => expect(provider).toHaveFocus())
  const panel = screen.getByRole('tabpanel')
  expect(panel.textContent).toContain('model_provider = "aas-relay"')
  // OpenRouter only declares Codex, so no Claude Code settings are shown for it.
  expect(panel.textContent).not.toContain('ANTHROPIC_BASE_URL')
  expect(panel.textContent).toContain('不支持 Claude Code')
  expect(panel.textContent).toContain('~/.agents/providers/openrouter/')
})

test('install map falls back to a placeholder slug when the catalog is empty', () => {
  render(<InstallMap samples={{ skill: null, mcp: null, provider: null }} />)
  const panel = screen.getByRole('tabpanel')
  expect(panel.textContent).toContain('目录暂时取不到')
  expect(panel.textContent).toContain('~/.claude/skills/<slug>')
})

test('terminal demo has one tab per aas command and shows its captured output', () => {
  render(<TerminalDemo />)
  const tabs = screen.getAllByRole('tab')
  expect(tabs.map((t) => t.textContent)).toEqual(['search', 'install', 'enable'])
  for (const s of TERMINAL_SESSIONS) for (const step of s.steps) expect(step.command.startsWith('aas ')).toBe(true)

  fireEvent.mouseDown(tabs[2], { button: 0 })
  const panel = screen.getByRole('tabpanel')
  expect(panel.textContent).toContain('aas install context7 --target claude')
  expect(panel.textContent).toContain('aas enable context7 --for codex')
  expect(panel.textContent).toContain('context7 enabled for codex')
})

test('faq answers are collapsed until their question is opened, and several can be open', () => {
  render(<Faq />)
  const buttons = screen.getAllByRole('button')
  expect(buttons).toHaveLength(FAQ_KEYS.length)
  expect(buttons.every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'API 密钥存在哪？' }))
  fireEvent.click(screen.getByRole('button', { name: '能干净卸载吗？' }))
  expect(screen.getByText(/~\/\.agents\/providers\/ 下该供应商目录的 config\.json/)).toBeInTheDocument()
  expect(screen.getByText(/逐字节比较/)).toBeInTheDocument()
})

const release = parseRelease({
  tag_name: 'v0.2.1',
  html_url: 'https://github.com/phenix3443/agent-store/releases/tag/v0.2.1',
  assets: [
    { name: 'A_0.2.1_universal.dmg', size: 93368276, browser_download_url: 'https://dl.test/a.dmg' },
    { name: 'A_0.2.1_x64-setup.exe', size: 45092220, browser_download_url: 'https://dl.test/a.exe' },
    { name: 'A_0.2.1_x64_en-US.msi', size: 59342848, browser_download_url: 'https://dl.test/a.msi' },
    { name: 'A_0.2.1_amd64.deb', size: 58562456, browser_download_url: 'https://dl.test/a.deb' },
  ],
})

test('download section lists each file with its size and marks the visitor system and default file', () => {
  const { container } = render(<DownloadSection release={release} visitorOs="win" />)
  expect(screen.getByText('v0.2.1')).toBeInTheDocument()
  const win = container.querySelector('[data-os="win"]') as HTMLElement
  expect(win.dataset.recommended).toBe('true')
  expect(within(win).getByText('根据你的系统推荐')).toBeInTheDocument()
  const exe = within(win).getByText('A_0.2.1_x64-setup.exe').closest('a')!
  expect(exe.getAttribute('href')).toBe('https://dl.test/a.exe')
  expect(exe.textContent).toContain('43 MB')
  expect(exe.textContent).toContain('推荐')
  expect(within(win).getByText('A_0.2.1_x64_en-US.msi').closest('a')!.textContent).not.toContain('推荐')
  expect(container.querySelectorAll('[data-recommended]')).toHaveLength(1)
  expect(screen.getByText(/安装包暂未签名/)).toBeInTheDocument()
})

test('download section points at the releases page when the release cannot be read', () => {
  render(<DownloadSection release={null} visitorOs="mac" />)
  expect(screen.getByRole('status').textContent).toContain('暂时读不到')
  expect(screen.getByRole('link', { name: '去 GitHub 发布页下载' }).getAttribute('href')).toContain('/releases/latest')
  expect(screen.getByText(/安装包暂未签名/)).toBeInTheDocument()
})

test('hero download offers one button for a known system and three for unknown ones', () => {
  render(<HeroDownload visitorOs="mac" />)
  expect(screen.getByRole('link', { name: '下载 macOS 版' }).getAttribute('href')).toBe('/download/mac')
  expect(screen.queryByRole('link', { name: '下载 Windows 版' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Linux' }).getAttribute('href')).toBe('/#download')
  cleanup()
  render(<HeroDownload visitorOs={null} />)
  expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/download/mac', '/download/win', '/#download'])
})
