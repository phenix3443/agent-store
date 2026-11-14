import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { intlMock } from '../../test-intl'
import { skillResource, summary } from './fixtures'

mock.module('next-intl', () => intlMock)

const skill = summary(skillResource)
const realFetch = globalThis.fetch
const realMatchMedia = window.matchMedia
let calls: string[]
let answer: () => Promise<Response>

beforeEach(() => {
  calls = []
  answer = async () => new Response(JSON.stringify({ installed: [skill.id] }))
  localStorage.clear()
  globalThis.fetch = (async (url: string) => {
    calls.push(url)
    return answer()
  }) as unknown as typeof fetch
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: async () => Promise.reject(new TypeError('unknown')) },
  })
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
  window.matchMedia = realMatchMedia
})

const { LocalInstalledProvider, InstalledBadge } = await import('../LocalInstalled')
const { InstallButton } = await import('../InstallButton')
const { InstallNoticeProvider } = await import('../InstallNotice')

function mount() {
  return render(
    <InstallNoticeProvider>
      <LocalInstalledProvider>
        <InstalledBadge id={skill.id} />
        <InstallButton resource={skill} command="npx skills add obra/superpowers --skill brainstorming" />
      </LocalInstalledProvider>
    </InstallNoticeProvider>
  )
}

test('installed here: the badge shows and the primary action becomes manage', async () => {
  localStorage.setItem('as.desktopClient', '1')
  mount()
  expect(await screen.findByRole('button', { name: '在桌面客户端中管理 brainstorming' })).toBeTruthy()
  expect(screen.getByText('已安装')).toBeTruthy()
  expect(calls).toHaveLength(1)
})

test('a browser that never used the client sends nothing and the page is as before', async () => {
  mount()
  await new Promise((r) => setTimeout(r, 120))
  expect(calls).toEqual([])
  expect(screen.getByRole('button', { name: '在桌面客户端中安装 brainstorming' })).toBeTruthy()
  expect(screen.queryByText('已安装')).toBeNull()
})

test('when the client is not running, nothing changes', async () => {
  localStorage.setItem('as.desktopClient', '1')
  answer = async () => {
    throw new TypeError('Failed to fetch')
  }
  mount()
  await waitFor(() => expect(calls).toHaveLength(1))
  await new Promise((r) => setTimeout(r, 20))
  expect(screen.getByRole('button', { name: '在桌面客户端中安装 brainstorming' })).toBeTruthy()
  expect(screen.queryByText('已安装')).toBeNull()
})

test('not installed: the install action stays', async () => {
  localStorage.setItem('as.desktopClient', '1')
  answer = async () => new Response(JSON.stringify({ installed: [] }))
  mount()
  await waitFor(() => expect(calls).toHaveLength(1))
  expect(screen.getByRole('button', { name: '在桌面客户端中安装 brainstorming' })).toBeTruthy()
  expect(screen.queryByText('已安装')).toBeNull()
})
