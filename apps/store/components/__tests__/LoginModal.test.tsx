import { test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { intlMock } from '../../test-intl'

mock.module('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
mock.module('next-intl', () => intlMock)
afterEach(() => cleanup())

const { LoginModal } = await import('../LoginModal')

test('offers only the providers the server enabled', () => {
  render(<LoginModal open onOpenChange={() => {}} providers={['github']} />)
  expect(screen.getByRole('link', { name: '用 GitHub 登录' }).getAttribute('href')).toBe('/auth/login?provider=github')
  expect(screen.queryByRole('link', { name: '用 Google 登录' })).toBeNull()
})

test('shows Google when it is configured', () => {
  render(<LoginModal open onOpenChange={() => {}} providers={['github', 'google']} />)
  expect(screen.getByRole('link', { name: '用 Google 登录' }).getAttribute('href')).toBe('/auth/login?provider=google')
})

test('says what logging in is for, and nothing the account does not do', () => {
  render(<LoginModal open onOpenChange={() => {}} />)
  const dialog = screen.getByRole('dialog')
  expect(dialog.textContent).toContain('登录后可以订阅 Pro。')
  for (const word of ['收藏', '同步', 'demo']) expect(dialog.textContent).not.toContain(word)
})

test('a sign-in that did not finish is announced in place of the default line', () => {
  render(<LoginModal open onOpenChange={() => {}} error="登录没有完成，请再试一次。" />)
  expect(screen.getByRole('alert').textContent).toBe('登录没有完成，请再试一次。')
})
