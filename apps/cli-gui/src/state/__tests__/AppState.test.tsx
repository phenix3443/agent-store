import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../AppState'

afterEach(() => { cleanup() })

function Probe() {
  const {
    navView, setNavView, categoryFilter, setCategoryFilter,
    listFilter, setListFilter, selectedSlug, setSelectedSlug,
    favoriteSlugs, toggleFavorite, terminalExpanded, setTerminalExpanded,
  } = useAppState()
  return (
    <div>
      <span data-testid="nav">{navView}</span>
      <span data-testid="category">{categoryFilter}</span>
      <span data-testid="filter">{listFilter}</span>
      <span data-testid="selected">{selectedSlug ?? 'none'}</span>
      <span data-testid="favorites">{[...favoriteSlugs].join(',')}</span>
      <span data-testid="terminal">{String(terminalExpanded)}</span>
      <button onClick={() => setNavView('updates')}>set-nav</button>
      <button onClick={() => setCategoryFilter('provider')}>set-category</button>
      <button onClick={() => setListFilter('installed')}>set-filter</button>
      <button onClick={() => setSelectedSlug('filesystem')}>select</button>
      <button onClick={() => toggleFavorite('filesystem')}>toggle-fav</button>
      <button onClick={() => setTerminalExpanded(true)}>expand-terminal</button>
    </div>
  )
}

function renderProbe() {
  return render(
    <AppStateProvider>
      <Probe />
    </AppStateProvider>
  )
}

test('defaults: browse nav, all category, all filter, no selection, no favorites, terminal collapsed', () => {
  renderProbe()
  expect(screen.getByTestId('nav').textContent).toBe('browse')
  expect(screen.getByTestId('category').textContent).toBe('all')
  expect(screen.getByTestId('filter').textContent).toBe('all')
  expect(screen.getByTestId('selected').textContent).toBe('none')
  expect(screen.getByTestId('favorites').textContent).toBe('')
  expect(screen.getByTestId('terminal').textContent).toBe('false')
})

test('setters update their respective fields', () => {
  renderProbe()
  fireEvent.click(screen.getByText('set-nav'))
  fireEvent.click(screen.getByText('set-category'))
  fireEvent.click(screen.getByText('set-filter'))
  fireEvent.click(screen.getByText('select'))
  fireEvent.click(screen.getByText('expand-terminal'))
  expect(screen.getByTestId('nav').textContent).toBe('updates')
  expect(screen.getByTestId('category').textContent).toBe('provider')
  expect(screen.getByTestId('filter').textContent).toBe('installed')
  expect(screen.getByTestId('selected').textContent).toBe('filesystem')
  expect(screen.getByTestId('terminal').textContent).toBe('true')
})

test('toggleFavorite adds then removes a slug', () => {
  renderProbe()
  fireEvent.click(screen.getByText('toggle-fav'))
  expect(screen.getByTestId('favorites').textContent).toBe('filesystem')
  fireEvent.click(screen.getByText('toggle-fav'))
  expect(screen.getByTestId('favorites').textContent).toBe('')
})
