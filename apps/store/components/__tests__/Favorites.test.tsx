import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { intlMock } from '../../test-intl'

mock.module('next-intl', () => intlMock)
mock.module('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }),
  usePathname: () => '/store',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: () => {
    throw new Error('NEXT_REDIRECT')
  },
}))

const { FavoritesProvider, FavoriteButton } = await import('../Favorites')
type Outcome = 'ok' | 'signedOut' | 'full' | 'error'

const ID = 'github:anthropics/skills/frontend-design'
let saved: string[]
let saves: [string, boolean][]
let outcome: Outcome
let listed: string[] | null

const actions = {
  list: async () => listed,
  save: async (id: string, on: boolean): Promise<Outcome> => {
    saves.push([id, on])
    return outcome
  },
}

beforeEach(() => {
  saved = [ID]
  listed = saved
  saves = []
  outcome = 'ok'
  sessionStorage.clear()
})
afterEach(() => cleanup())

function mount(signedIn: boolean) {
  return render(
    <FavoritesProvider signedIn={signedIn} actions={actions}>
      <FavoriteButton id={ID} name="frontend-design" />
    </FavoritesProvider>
  )
}

const heart = () => screen.getByRole('button', { name: /frontend-design/ })

test('signed out: the heart asks to log in, coming back to this page, and remembers what to save', async () => {
  const requests: { next?: string; body?: string }[] = []
  const listener = (e: Event) => requests.push((e as CustomEvent).detail)
  window.addEventListener('as:login', listener)
  window.history.replaceState(null, '', '/store?category=skill')
  mount(false)
  expect(heart().getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(heart())
  await waitFor(() => expect(requests).toHaveLength(1))
  window.removeEventListener('as:login', listener)
  expect(requests[0]).toEqual({ next: '/store?category=skill', body: '登录后就能收藏。' })
  expect(sessionStorage.getItem('as.pendingFavorite')).toBe(ID)
  expect(saves).toEqual([])
})

test('signed in: the saved state comes from the account, and pressing removes it', async () => {
  mount(true)
  await waitFor(() => expect(heart().getAttribute('aria-pressed')).toBe('true'))
  expect(heart().getAttribute('aria-label')).toBe('取消收藏 frontend-design')
  fireEvent.click(heart())
  await waitFor(() => expect(heart().getAttribute('aria-pressed')).toBe('false'))
  expect(saves).toEqual([[ID, false]])
  expect(await screen.findByText('已取消收藏')).toBeTruthy()
})

test('a save the API refused is undone and said so', async () => {
  listed = []
  outcome = 'error'
  mount(true)
  await waitFor(() => expect(heart().getAttribute('aria-disabled')).toBeNull())
  fireEvent.click(heart())
  expect(await screen.findByText('没能保存，请稍后再试。')).toBeTruthy()
  expect(heart().getAttribute('aria-pressed')).toBe('false')
  expect(saves).toEqual([[ID, true]])
})

test('the heart pressed before signing in is saved on the way back', async () => {
  listed = []
  sessionStorage.setItem('as.pendingFavorite', ID)
  mount(true)
  await waitFor(() => expect(heart().getAttribute('aria-pressed')).toBe('true'))
  expect(saves).toEqual([[ID, true]])
  expect(sessionStorage.getItem('as.pendingFavorite')).toBeNull()
})

test('an unreadable list leaves the heart unpressed and says saving failed', async () => {
  listed = null
  mount(true)
  await waitFor(() => expect(heart().getAttribute('aria-disabled')).toBeNull())
  fireEvent.click(heart())
  expect(await screen.findByText('没能保存，请稍后再试。')).toBeTruthy()
  expect(saves).toEqual([])
})
