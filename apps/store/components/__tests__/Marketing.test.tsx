import { test, expect, mock, afterEach } from 'bun:test'
import { act, render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { intlMock } from '../../test-intl'
import { parseRelease } from '../../lib/latest-release'
import { mcpResource, providerResource, skillResource } from './fixtures'

mock.module('next/link', () => ({
  default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
mock.module('next-intl', () => intlMock)

afterEach(() => {
  cleanup()
})

const { DownloadButton, SupportedAgents } = await import('../marketing/Marketing')
const { ProductDemo } = await import('../marketing/ProductDemo')
const { SHOTS, shotSrc } = await import('../marketing/Window')
const { CatalogShelf } = await import('../marketing/CatalogShelf')
const { cardArt } = await import('../marketing/shelf')
const { Faq, FAQ_KEYS } = await import('../marketing/Faq')
const { SkillLinks } = await import('../marketing/SkillLinks')
const { RelayDemo } = await import('../marketing/RelayDemo')
const { downloadRows } = await import('../marketing/download-rows')

test('the download button names the visitor system and falls back to the download page', () => {
  render(<DownloadButton visitorOs="mac" />)
  expect(screen.getByRole('link', { name: '下载 macOS 版' }).getAttribute('href')).toBe('/download/mac')
  cleanup()
  render(<DownloadButton visitorOs="linux" />)
  expect(screen.getByRole('link', { name: '下载 Linux 版' }).getAttribute('href')).toBe('/download#linux')
  cleanup()
  render(<DownloadButton visitorOs={null} />)
  expect(screen.getByRole('link', { name: '免费下载' }).getAttribute('href')).toBe('/download')
})

test('only Claude Code and Codex are named as supported agents', () => {
  render(<SupportedAgents />)
  const text = document.body.textContent ?? ''
  expect(text).toContain('Claude Code')
  expect(text).toContain('Codex')
  expect(text).toContain('更多即将支持')
})

// Radix Tabs activate on mousedown, and on arrow keys after a setTimeout.
test('the product demo shows one real screenshot per dock tab', async () => {
  render(<ProductDemo />)
  const tabs = screen.getAllByRole('tab')
  expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual(['安装', 'MCP', '供应商', '用量'])
  expect(screen.getByRole('tabpanel').querySelector('img')!.getAttribute('src')).toBe('/landing/zh/install.webp')

  fireEvent.mouseDown(tabs[1], { button: 0 })
  expect(screen.getByRole('tabpanel').querySelector('img')!.getAttribute('src')).toBe('/landing/zh/mcp.webp')
  expect(document.body.textContent).toContain('停用不用删')

  act(() => tabs[1].focus())
  fireEvent.keyDown(tabs[1], { key: 'ArrowRight' })
  await waitFor(() => expect(tabs[2]).toHaveFocus())
  expect(tabs[2].getAttribute('aria-selected')).toBe('true')
  expect(screen.getByRole('tabpanel').querySelector('img')!.getAttribute('src')).toBe('/landing/zh/relay.webp')
})

test('screenshots come in the page language, Chinese for anything else', () => {
  expect(shotSrc(SHOTS.usage, 'en')).toBe('/landing/en/usage.webp')
  expect(shotSrc(SHOTS.skillsNarrow, 'zh')).toBe('/landing/zh/skills-narrow.webp')
  expect(shotSrc(SHOTS.skills, 'ja')).toBe('/landing/zh/skills.webp')
})

test('shelf cards draw their art from the record itself', () => {
  expect(cardArt(skillResource)).toEqual({
    big: 'SKILL.md',
    lines: [skillResource.origin.upstreamId, expect.stringContaining('npx skills add')],
  })
  expect(cardArt(mcpResource).big).toBe('npm')
  expect(cardArt(mcpResource).lines).toContain('io.github.ankimcp/anki-mcp-server')
  expect(cardArt(providerResource)).toEqual({ big: 'openrouter', lines: ['aas install openrouter', 'router'] })
})

test('the catalog shelf switches categories and links every card to its detail', () => {
  render(<CatalogShelf samples={{ skill: [skillResource], mcp: [mcpResource], provider: [] }} />)
  const list = screen.getByRole('list', { name: '技能样本，可横向滚动' })
  expect(within(list).getByRole('link').getAttribute('href')).toContain('/store/skill/')
  expect(screen.getByRole('link', { name: /看全部技能/ }).getAttribute('href')).toBe('/store?category=skill')

  fireEvent.mouseDown(screen.getByRole('tab', { name: 'MCP' }), { button: 0 })
  expect(screen.getByRole('link', { name: /Anki MCP/ }).getAttribute('href')).toContain('/store/mcp/')
  expect(screen.getByRole('link', { name: /看全部MCP/ }).getAttribute('href')).toBe('/store?category=mcp')

  fireEvent.mouseDown(screen.getByRole('tab', { name: '供应商' }), { button: 0 })
  expect(screen.getByRole('status').textContent).toContain('目录暂时取不到')
})

test('the faq opens the first answer and lets several stay open', () => {
  render(<Faq />)
  const buttons = screen.getAllByRole('button')
  expect(buttons).toHaveLength(FAQ_KEYS.length)
  expect(buttons.map((b) => b.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false'])
  fireEvent.click(screen.getByRole('button', { name: '要付费吗？' }))
  expect(buttons[0].getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByText(/智能路由和多 Key 轮换/)).toBeInTheDocument()
})

test('the skill diagram links the library copy into each agent the switch enables', () => {
  const { container } = render(<SkillLinks />)
  const rows = container.querySelectorAll('.link-row')
  expect(rows[0].textContent).toContain('~/.claude/skills/tdd')
  expect(rows[1].textContent).toContain('~/.codex/skills/tdd')
  expect([...rows].map((r) => r.getAttribute('data-on'))).toEqual(['true', 'false'])
  fireEvent.click(screen.getByRole('switch', { name: '对 Codex 启用' }))
  expect(rows[1].getAttribute('data-on')).toBe('true')
})

test('the relay diagram shows the failover as a still when motion is reduced', () => {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query })) as typeof window.matchMedia
  try {
    const { container } = render(<RelayDemo />)
    expect(container.textContent).toContain('127.0.0.1:18780')
    expect(container.textContent).toContain('503')
    expect(container.textContent).toContain('改发 供应商 B')
    fireEvent.click(screen.getByRole('switch', { name: '让第一家出错（演示）' }))
    expect(container.textContent).not.toContain('503')
  } finally {
    window.matchMedia = original
  }
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

test('download rows put the visitor system first and link the release files with their sizes', () => {
  const rows = downloadRows(release, 'win')
  expect(rows.map((r) => r.os)).toEqual(['win', 'mac', 'linux'])
  expect(rows[0].files).toEqual([
    { kind: 'exe', href: 'https://dl.test/a.exe', size: '43 MB' },
    { kind: 'msi', href: 'https://dl.test/a.msi', size: '57 MB' },
  ])
  expect(rows[2].files.map((f) => f.kind)).toEqual(['deb'])
})

test('download rows fall back to the redirecting routes when the release cannot be read', () => {
  const rows = downloadRows(null, null)
  expect(rows.map((r) => r.os)).toEqual(['mac', 'win', 'linux'])
  expect(rows.flatMap((r) => r.files.map((f) => f.href))).toEqual([
    '/download/mac',
    '/download/win',
    '/download/linux-deb',
    '/download/linux-rpm',
    '/download/linux-appimage',
  ])
  expect(rows.every((r) => r.files.every((f) => f.size === null))).toBe(true)
})
