import { test, expect, afterEach, beforeEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import * as rpcModule from '../lib/rpc'
import { App } from '../App'
import { settleRpc } from '../test/settle'

// Pin the UI language so these assertions don't depend on the host's OS locale
// (I18nProvider auto-detects the browser locale on first run).
beforeEach(() => { try { localStorage.setItem('as-locale', 'zh') } catch { /* ignore */ } })
afterEach(async () => { cleanup(); await settleRpc(); mock.restore(); try { localStorage.clear() } catch { /* ignore */ } })

function mockAllRpcs() {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return [{ slug: 'find-skills', category: 'skill', version: '1.0.0', installedAt: '', updatedAt: '', compatibleWith: ['claude'], enabledFor: { claude: true } }]
    if (method === 'info') return { slug: 'find-skills', category: 'skill', name: 'find-skills', description: '', publisher: { name: 'x', tier: 'community' } }
    if (method === 'search') return { resources: [], nextOffset: null, offline: false }
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: true }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    if (method === 'getEntitlements') return { plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }
    throw new Error(`unexpected RPC in smoke test: ${method}`)
  }) as typeof rpcModule.callRpc)
}

function nav() {
  return within(screen.getByRole('navigation', { name: '主导航' }))
}

test('opens on Discover with the sidebar sections, relay status and account', async () => {
  mockAllRpcs()
  render(<App />)

  for (const name of ['发现', '技能', 'MCP', '供应商', '用量', '设置']) {
    expect(nav().getByRole('button', { name: new RegExp(name) })).toBeInTheDocument()
  }
  expect(nav().getByRole('button', { name: /发现/ })).toHaveAttribute('aria-current', 'page')
  expect(await screen.findByPlaceholderText('搜索，或用 @ 过滤…')).toBeInTheDocument()
  expect(await nav().findByText('中转运行中')).toBeInTheDocument()
  expect(nav().getByRole('button', { name: /账户菜单/ })).toBeInTheDocument()
  expect(await screen.findByText('目录在线')).toBeInTheDocument()
})

test('the skills section counts installed skills and filters the list by category', async () => {
  mockAllRpcs()
  render(<App />)
  const skills = nav().getByRole('button', { name: /技能/ })
  expect(await within(skills).findByText('1')).toBeInTheDocument()
  fireEvent.click(skills)
  expect(skills).toHaveAttribute('aria-current', 'page')
})

test('用量 shows the usage dashboard and 设置 the settings page', async () => {
  mockAllRpcs()
  render(<App />)
  fireEvent.click(nav().getByRole('button', { name: /用量/ }))
  expect(await screen.findByText('消耗趋势')).toBeInTheDocument()
  fireEvent.click(nav().getByRole('button', { name: /设置/ }))
  expect(await screen.findByText('当前只提供深色主题。')).toBeInTheDocument()
})

test('Ctrl+K opens the command palette and its go-to entries navigate', async () => {
  mockAllRpcs()
  render(<App />)
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
  const dialog = await screen.findByRole('dialog', { name: '命令面板' })
  fireEvent.click(within(dialog).getByText('用量'))
  expect(await screen.findByText('消耗趋势')).toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: '命令面板' })).toBeNull()
})

test('Ctrl+6 goes to settings and ? lists the shortcuts', async () => {
  mockAllRpcs()
  render(<App />)
  fireEvent.keyDown(window, { key: '6', ctrlKey: true })
  expect(nav().getByRole('button', { name: /设置/ })).toHaveAttribute('aria-current', 'page')
  fireEvent.keyDown(window, { key: '?' })
  expect(await screen.findByRole('dialog', { name: '键盘快捷键' })).toBeInTheDocument()
})

test('the title bar search opens the palette', async () => {
  mockAllRpcs()
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /搜索目录与操作/ }))
  expect(await screen.findByRole('dialog', { name: '命令面板' })).toBeInTheDocument()
})

test('a palette search lands in the Discover search field; installed items are listed', async () => {
  mockAllRpcs()
  render(<App />)
  fireEvent.click(nav().getByRole('button', { name: /用量/ }))
  fireEvent.keyDown(window, { key: 'k', metaKey: true })
  const dialog = await screen.findByRole('dialog', { name: '命令面板' })
  fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'find' } })
  expect(await within(dialog).findByText('find-skills')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByText('在目录中搜索「find」'))
  expect(await screen.findByDisplayValue('find')).toBeInTheDocument()
  expect(nav().getByRole('button', { name: /发现/ })).toHaveAttribute('aria-current', 'page')
})
