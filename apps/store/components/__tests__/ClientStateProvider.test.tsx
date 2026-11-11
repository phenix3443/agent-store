import { test, expect, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ClientStateProvider, useClientState } from '../ClientStateProvider'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

function Probe() {
  const state = useClientState()
  return (
    <div>
      <button onClick={() => state.toggleFavorite('item-1')}>fav</button>
      <span data-testid="fav-state">{String(!!state.favorites['item-1'])}</span>
      <span data-testid="keys">{Object.keys(state).sort().join(',')}</span>
    </div>
  )
}

test('toggleFavorite flips favorite state', () => {
  render(<ClientStateProvider><Probe /></ClientStateProvider>)
  expect(screen.getByTestId('fav-state').textContent).toBe('false')
  fireEvent.click(screen.getByText('fav'))
  expect(screen.getByTestId('fav-state').textContent).toBe('true')
})

test('the web store keeps no "installed" state, even when an old one is in storage', () => {
  localStorage.setItem('aas-store-client-state', JSON.stringify({ favorites: {}, installed: { 'item-1': true }, userItems: [] }))
  render(<ClientStateProvider><Probe /></ClientStateProvider>)
  expect(screen.getByTestId('keys').textContent).toBe('addUserItem,favorites,toggleFavorite,userItems')
})

test('state persists to localStorage and rehydrates on remount', () => {
  const { unmount } = render(<ClientStateProvider><Probe /></ClientStateProvider>)
  fireEvent.click(screen.getByText('fav'))
  unmount()
  render(<ClientStateProvider><Probe /></ClientStateProvider>)
  expect(screen.getByTestId('fav-state').textContent).toBe('true')
})
