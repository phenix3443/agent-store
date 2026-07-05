import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AppStateProvider } from '../../state/AppState'
import { IconRail } from '../IconRail'

afterEach(() => { cleanup() })

function renderIconRail() {
  return render(
    <AppStateProvider>
      <IconRail />
    </AppStateProvider>
  )
}

test('shows exactly four nav/category buttons: 概览, 供应商, 技能, MCP', () => {
  renderIconRail()
  expect(screen.getByLabelText('概览')).toBeInTheDocument()
  expect(screen.getByLabelText('供应商')).toBeInTheDocument()
  expect(screen.getByLabelText('技能')).toBeInTheDocument()
  expect(screen.getByLabelText('MCP')).toBeInTheDocument()
  expect(screen.queryByLabelText('浏览商店')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('全部')).not.toBeInTheDocument()
})

test('defaults to 概览 active', () => {
  renderIconRail()
  expect(screen.getByLabelText('概览')).toHaveClass('bg-store-accent-soft')
})

test('clicking 供应商 sets categoryFilter to provider and navView to browse', () => {
  renderIconRail()
  fireEvent.click(screen.getByLabelText('供应商'))
  expect(screen.getByLabelText('供应商')).toHaveClass('bg-store-accent-soft')
})

test('clicking 技能 sets categoryFilter to skill and navView to browse', () => {
  renderIconRail()
  fireEvent.click(screen.getByLabelText('技能'))
  expect(screen.getByLabelText('技能')).toHaveClass('bg-store-accent-soft')
})

test('clicking 概览 after switching to a category returns to the overview state', () => {
  renderIconRail()
  fireEvent.click(screen.getByLabelText('供应商'))
  fireEvent.click(screen.getByLabelText('概览'))
  expect(screen.getByLabelText('概览')).toHaveClass('bg-store-accent-soft')
  expect(screen.getByLabelText('供应商')).not.toHaveClass('bg-store-accent-soft')
})

test('shows a settings button at the bottom of the rail', () => {
  renderIconRail()
  expect(screen.getByLabelText('设置')).toBeInTheDocument()
})
