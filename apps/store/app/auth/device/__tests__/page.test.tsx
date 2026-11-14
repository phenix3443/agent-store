import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { intlMock } from '../../../../test-intl'

mock.module('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next-intl', () => intlMock)

type Res = { data: unknown; error: unknown }
let user: { email: string } | null = null
let verify: Res = { data: { status: 'pending', client_id: 'agent-store-desktop' }, error: null }
let decision: Res = { data: { success: true }, error: null }
const calls: Array<{ path: string; init: unknown }> = []
const social: Array<{ provider: string; callbackURL: string }> = []

mock.module('@/lib/auth/client', () => ({
  authClient: {
    getSession: async () => ({ data: user ? { user } : null, error: null }),
    signIn: {
      social: async (opts: { provider: string; callbackURL: string }) => {
        social.push(opts)
        return { data: { url: 'https://github.com/login' }, error: null }
      },
    },
    $fetch: async (path: string, init: unknown) => {
      calls.push({ path, init })
      return path === '/device' ? verify : decision
    },
  },
}))

const { default: Page } = await import('../page')

function at(search: string) {
  window.history.replaceState(null, '', `/auth/device${search}`)
  render(<Page />)
}

beforeEach(() => {
  user = { email: 'octo@example.com' }
  verify = { data: { status: 'pending', client_id: 'agent-store-desktop' }, error: null }
  decision = { data: { success: true }, error: null }
  calls.length = 0
  social.length = 0
})
afterEach(() => cleanup())

test('signed in: shows the code and the account, and approves only on a click', async () => {
  at('?user_code=ABCDEFGH')
  expect(await screen.findByText('允许桌面客户端登录？')).toBeInTheDocument()
  expect(screen.getByText('ABCD-EFGH')).toBeInTheDocument()
  expect(screen.getByText('Agent Store 客户端请求以 octo@example.com 登录。')).toBeInTheDocument()
  expect(calls.map((c) => c.path)).toEqual(['/device'])
  fireEvent.click(screen.getByRole('button', { name: '允许' }))
  expect(await screen.findByText('已允许')).toBeInTheDocument()
  expect(calls[1]).toEqual({ path: '/device/approve', init: { method: 'POST', body: { userCode: 'ABCDEFGH' } } })
})

test('deny sends the denial', async () => {
  at('?user_code=ABCDEFGH')
  fireEvent.click(await screen.findByRole('button', { name: '拒绝' }))
  expect(await screen.findByText('已拒绝')).toBeInTheDocument()
  expect(calls[1]?.path).toBe('/device/deny')
})

test('signed out with a provider: starts that sign-in and comes back to this page', async () => {
  user = null
  at('?user_code=ABCDEFGH&provider=google')
  await waitFor(() => expect(social).toEqual([{ provider: 'google', callbackURL: '/auth/device?user_code=ABCDEFGH' }]))
  expect(calls).toEqual([])
})

test('signed out without a provider: offers both sign-in buttons', async () => {
  user = null
  at('?user_code=ABCDEFGH')
  fireEvent.click(await screen.findByRole('button', { name: '使用 GitHub 登录' }))
  await waitFor(() => expect(social[0]?.provider).toBe('github'))
})

test('an expired, used, foreign or missing code says so and offers nothing to approve', async () => {
  verify = { data: null, error: { error: 'expired_token', status: 400 } }
  at('?user_code=ABCDEFGH')
  expect(await screen.findByText('登录请求已过期')).toBeInTheDocument()
  cleanup()

  verify = { data: { status: 'approved', client_id: 'agent-store-desktop' }, error: null }
  at('?user_code=ABCDEFGH')
  expect(await screen.findByText('这个登录请求已经处理过')).toBeInTheDocument()
  cleanup()

  verify = { data: { status: 'pending' }, error: null }
  at('?user_code=ABCDEFGH')
  expect(await screen.findByText('这个登录请求属于另一个账号')).toBeInTheDocument()
  cleanup()

  at('')
  expect(await screen.findByText('没有找到这个登录请求')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '允许' })).toBeNull()
})
