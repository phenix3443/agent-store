import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { IconRail } from '../IconRail'

afterEach(() => { cleanup() })

function Probe() {
  const { navView, categoryFilter } = useAppState()
  return <span data-testid="probe">{navView}:{categoryFilter}</span>
}

function renderIconRail() {
  return render(
    <AppStateProvider>
      <IconRail />
      <Probe />
    </AppStateProvider>
  )
}

test('defaults to browse nav and all category', () => {
  renderIconRail()
  expect(screen.getByTestId('probe').textContent).toBe('browse:all')
})

test('clicking 更新 switches nav view to updates', () => {
  renderIconRail()
  fireEvent.click(screen.getByLabelText('更新'))
  expect(screen.getByTestId('probe').textContent).toBe('updates:all')
})

test('clicking 浏览商店 switches nav view back to browse', () => {
  renderIconRail()
  fireEvent.click(screen.getByLabelText('更新'))
  fireEvent.click(screen.getByLabelText('浏览商店'))
  expect(screen.getByTestId('probe').textContent).toBe('browse:all')
})

test('clicking a category icon sets categoryFilter', () => {
  renderIconRail()
  fireEvent.click(screen.getByLabelText('供应商'))
  expect(screen.getByTestId('probe').textContent).toBe('browse:provider')
  fireEvent.click(screen.getByLabelText('全部'))
  expect(screen.getByTestId('probe').textContent).toBe('browse:all')
})

test('clicking 设置 opens the settings modal', () => {
  renderIconRail()
  fireEvent.click(screen.getByLabelText('设置'))
  expect(screen.getByText('设置')).toBeInTheDocument()
})
