import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { intlMock } from '../../test-intl'
import { mcpItem } from './fixtures'

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
      <InstallButton item={mcpItem} />
    </InstallNoticeProvider>
  )
}

function lastFrameSrc() {
  return document.querySelector('iframe')?.getAttribute('src')
}

test('clicking install opens the agreed desktop link', async () => {
  renderRow()
  fireEvent.click(screen.getByRole('button', { name: '在桌面客户端中安装 Anki MCP' }))
  expect(lastFrameSrc()).toBe('agent-store://install?slug=anki-mcp&category=mcp')
  window.dispatchEvent(new Event('blur'))
  await waitFor(() => expect(screen.getByRole('button').textContent).toBe('已打开'))
})

test('when the page loses focus the launch is reported as opened, and nothing is copied', async () => {
  render(
    <InstallNoticeProvider>
      <InstallButton item={mcpItem} variant="primary" />
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
  fireEvent.click(screen.getByRole('button', { name: '在桌面客户端中安装 Anki MCP' }))
  await waitFor(() => expect(screen.getByText('没有检测到桌面客户端')).toBeInTheDocument(), { timeout: 3000 })
  expect(writeText).toHaveBeenCalledWith('aas install anki-mcp')
  expect(screen.getByText('安装命令已复制，可以在终端里运行，或先下载桌面客户端。')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '下载桌面客户端' }).getAttribute('href')).toBe('/download')
  await waitFor(() =>
    expect(document.querySelector('[role="status"][aria-live="assertive"]')?.textContent).toContain('没有检测到桌面客户端')
  )
  expect(screen.getByRole('button', { name: '在桌面客户端中安装 Anki MCP' }).textContent).toBe('安装')
})

test('if the copy fails too, the notice says so and still shows the command', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async () => { throw new Error('denied') } },
    configurable: true,
  })
  renderRow()
  fireEvent.click(screen.getByRole('button', { name: '在桌面客户端中安装 Anki MCP' }))
  await waitFor(() => expect(screen.getByText(/没能自动复制/)).toBeInTheDocument(), { timeout: 3000 })
  expect(screen.getByText('aas install anki-mcp')).toBeInTheDocument()
})

test('on a phone the row only offers copying the command', async () => {
  phone = true
  renderRow()
  expect(screen.queryByText('安装')).toBeNull()
  const button = screen.getByRole('button', { name: '复制 Anki MCP 的安装命令' })
  expect(button.textContent).toBe('复制命令')
  fireEvent.click(button)
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('aas install anki-mcp'))
  expect(document.querySelector('iframe')).toBeNull()
})

test('on a phone the detail panel explains where to run the command and drops the desktop actions', () => {
  phone = true
  render(
    <InstallNoticeProvider>
      <InstallPanel item={mcpItem} />
    </InstallNoticeProvider>
  )
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['复制命令'])
  expect(screen.getByText('在电脑上运行这条命令，或用桌面客户端安装。')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '下载桌面客户端' })).toBeNull()
})
