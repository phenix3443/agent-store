import { test, expect, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ClientStateProvider, useClientState } from '../ClientStateProvider'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

function Probe() {
  const { favorites, toggleFavorite, installed, toggleInstalled } = useClientState()
  return (
    <div>
      <button onClick={() => toggleFavorite('item-1')}>fav</button>
      <button onClick={() => toggleInstalled('item-1')}>install</button>
      <span data-testid="fav-state">{String(!!favorites['item-1'])}</span>
      <span data-testid="install-state">{String(!!installed['item-1'])}</span>
    </div>
  )
}

test('toggleFavorite flips favorite state', () => {
  render(<ClientStateProvider><Probe /></ClientStateProvider>)
  expect(screen.getByTestId('fav-state').textContent).toBe('false')
  fireEvent.click(screen.getByText('fav'))
  expect(screen.getByTestId('fav-state').textContent).toBe('true')
})

test('toggleInstalled flips installed state', () => {
  render(<ClientStateProvider><Probe /></ClientStateProvider>)
  fireEvent.click(screen.getByText('install'))
  expect(screen.getByTestId('install-state').textContent).toBe('true')
})

test('state persists to localStorage and rehydrates on remount', () => {
  const { unmount } = render(<ClientStateProvider><Probe /></ClientStateProvider>)
  fireEvent.click(screen.getByText('fav'))
  unmount()
  render(<ClientStateProvider><Probe /></ClientStateProvider>)
  expect(screen.getByTestId('fav-state').textContent).toBe('true')
})
