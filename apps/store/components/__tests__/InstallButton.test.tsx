import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { intlMock } from '../../test-intl'
import { mcpResource, skillResource, summary } from './fixtures'

const skill = summary(skillResource)
const skillCommand = 'npx skills add obra/superpowers --skill brainstorming'

mock.module('next-intl', () => intlMock)

let phone = false
const realMatchMedia = window.matchMedia
const writeText = mock(async () => {})
beforeEach(() => {
  phone = false
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  window.matchMedia = ((query: string) => ({
    matches: phone,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  window.matchMedia = realMatchMedia
})

const { InstallButton } = await import('../InstallButton')
const { InstallPanel } = await import('../InstallPanel')
const { InstallNoticeProvider } = await import('../InstallNotice')

function renderRow() {
  return render(
    <InstallNoticeProvider>
      <InstallButton resource={skill} command={skillCommand} />
    </InstallNoticeProvider>
  )
}

function lastFrameSrc() {
  return document.querySelector('iframe')?.getAttribute('src')
}

test('clicking install opens the agreed desktop link', async () => {
  renderRow()
  fireEvent.click(screen.getByRole('button', { name: '在桌面客户端中安装 brainstorming' }))
  expect(lastFrameSrc()).toBe(
    'agent-store://install?slug=superpowers-brainstorming&category=skill&id=github%3Aobra%2Fsuperpowers%2Fbrainstorming'
  )
  window.dispatchEvent(new Event('blur'))
  await waitFor(() => expect(screen.getByRole('button').textContent).toBe('已打开'))
})

test('when the page loses focus the launch is reported as opened, and nothing is copied', async () => {
  render(
    <InstallNoticeProvider>
      <InstallButton resource={skill} command={skillCommand} variant="primary" />
    </InstallNoticeProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: '在桌面客户端中安装' }))
  window.dispatchEvent(new Event('blur'))
  await waitFor(() => expect(screen.getByRole('button', { name: '已在客户端中打开' })).toBeInTheDocument())
  expect(writeText).not.toHaveBeenCalled()
  expect(screen.queryByText('没有检测到桌面客户端')).toBeNull()
  expect(document.body.textContent).not.toContain('已安装')
})

test('when nothing takes the link, the command is copied and a notice offers the download', async () => {
  renderRow()
  fireEvent.click(screen.getByRole('button', { name: '在桌面客户端中安装 brainstorming' }))
  await waitFor(() => expect(screen.getByText('没有检测到桌面客户端')).toBeInTheDocument(), { timeout: 3000 })
  expect(writeText).toHaveBeenCalledWith(skillCommand)
  expect(screen.getByText('安装命令已复制，可以在终端里运行，或先下载桌面客户端。')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '下载桌面客户端' }).getAttribute('href')).toBe('/download')
  await waitFor(() =>
    expect(document.querySelector('[role="status"][aria-live="assertive"]')?.textContent).toContain('没有检测到桌面客户端')
  )
  expect(screen.getByRole('button', { name: '在桌面客户端中安装 brainstorming' }).textContent).toBe('安装')
})

test('if the copy fails too, the notice says so and still shows the command', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async () => { throw new Error('denied') } },
    configurable: true,
  })
  renderRow()
  fireEvent.click(screen.getByRole('button', { name: '在桌面客户端中安装 brainstorming' }))
  await waitFor(() => expect(screen.getByText(/没能自动复制/)).toBeInTheDocument(), { timeout: 3000 })
  expect(screen.getByText(skillCommand)).toBeInTheDocument()
})

test('on a phone the row only offers copying the command', async () => {
  phone = true
  renderRow()
  expect(screen.queryByText('安装')).toBeNull()
  const button = screen.getByRole('button', { name: '复制 brainstorming 的安装命令' })
  expect(button.textContent).toBe('复制命令')
  fireEvent.click(button)
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(skillCommand))
  expect(document.querySelector('iframe')).toBeNull()
})

test('on a phone the detail panel explains where to run the command and drops the desktop actions', () => {
  phone = true
  render(
    <InstallNoticeProvider>
      <InstallPanel resource={skill} command={skillCommand} note="" />
    </InstallNoticeProvider>
  )
  expect(screen.getAllByRole('button').map((b) => b.textContent || b.getAttribute('aria-label'))).toEqual(['复制命令', `收藏 ${skill.name}`])
  expect(screen.getByText('在电脑上运行这条命令，或用桌面客户端安装。')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '下载桌面客户端' })).toBeNull()
})

test('without a command (an MCP row) the notice points to the detail and copies nothing', async () => {
  render(
    <InstallNoticeProvider>
      <InstallButton resource={summary(mcpResource)} command={null} />
    </InstallNoticeProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: '在桌面客户端中安装 Anki MCP' }))
  await waitFor(() => expect(screen.getByText('打开包的详情查看安装命令，或先下载桌面客户端。')).toBeInTheDocument(), { timeout: 3000 })
  expect(writeText).not.toHaveBeenCalled()
})

test('on a phone a row without a command shows no button: the row opens the detail', () => {
  phone = true
  render(
    <InstallNoticeProvider>
      <InstallButton resource={summary(mcpResource)} command={null} />
    </InstallNoticeProvider>
  )
  expect(screen.queryByRole('button')).toBeNull()
})
