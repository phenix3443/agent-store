import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../AppState'

afterEach(() => { cleanup() })

function Probe() {
  const {
    navView, setNavView, categoryFilter, setCategoryFilter,
    selectedSlug, setSelectedSlug,
    discoverFavorites, setDiscoverFavorites, terminalExpanded, setTerminalExpanded,
    installedVersion, bumpInstalledVersion,
  } = useAppState()
  return (
    <div>
      <span data-testid="nav">{navView}</span>
      <span data-testid="category">{categoryFilter}</span>
      <span data-testid="selected">{selectedSlug ?? 'none'}</span>
      <span data-testid="favorites">{String(discoverFavorites)}</span>
      <span data-testid="terminal">{String(terminalExpanded)}</span>
      <span data-testid="installed-version">{installedVersion}</span>
      <button onClick={() => setNavView('overview')}>set-nav</button>
      <button onClick={() => setCategoryFilter('provider')}>set-category</button>
      <button onClick={() => setSelectedSlug('filesystem')}>select</button>
      <button onClick={() => setDiscoverFavorites(true)}>show-favorites</button>
      <button onClick={() => setTerminalExpanded(true)}>expand-terminal</button>
      <button onClick={bumpInstalledVersion}>bump-installed-version</button>
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

test('defaults: discover (browse) nav, all category, no selection, the catalog not favorites, terminal collapsed', () => {
  renderProbe()
  expect(screen.getByTestId('nav').textContent).toBe('browse')
  expect(screen.getByTestId('category').textContent).toBe('all')
  expect(screen.getByTestId('selected').textContent).toBe('none')
  expect(screen.getByTestId('favorites').textContent).toBe('false')
  expect(screen.getByTestId('terminal').textContent).toBe('false')
  expect(screen.getByTestId('installed-version').textContent).toBe('0')
})

test('setters update their respective fields', () => {
  renderProbe()
  fireEvent.click(screen.getByText('set-nav'))
  fireEvent.click(screen.getByText('set-category'))
  fireEvent.click(screen.getByText('select'))
  fireEvent.click(screen.getByText('expand-terminal'))
  expect(screen.getByTestId('nav').textContent).toBe('overview')
  expect(screen.getByTestId('category').textContent).toBe('provider')
  expect(screen.getByTestId('selected').textContent).toBe('filesystem')
  expect(screen.getByTestId('terminal').textContent).toBe('true')
})

test('Discover can be switched to the favorites', () => {
  renderProbe()
  fireEvent.click(screen.getByText('show-favorites'))
  expect(screen.getByTestId('favorites').textContent).toBe('true')
})

test('bumpInstalledVersion increments the counter', () => {
  renderProbe()
  fireEvent.click(screen.getByText('bump-installed-version'))
  expect(screen.getByTestId('installed-version').textContent).toBe('1')
})
