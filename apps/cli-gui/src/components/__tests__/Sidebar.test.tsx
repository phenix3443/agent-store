import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { Sidebar } from '../Sidebar'

afterEach(() => { cleanup() })

function SectionProbe() {
  const { section, agentApp } = useAppState()
  return <span data-testid="probe">{section}:{agentApp}</span>
}

function renderSidebar() {
  return render(
    <AppStateProvider>
      <Sidebar />
      <SectionProbe />
    </AppStateProvider>
  )
}

test('defaults to installed section and claude app', () => {
  renderSidebar()
  expect(screen.getByTestId('probe').textContent).toBe('installed:claude')
})

test('clicking 浏览 switches to the browse section', () => {
  renderSidebar()
  fireEvent.click(screen.getByText('浏览'))
  expect(screen.getByTestId('probe').textContent).toBe('browse:claude')
})

test('clicking Codex switches the agent-app switcher', () => {
  renderSidebar()
  fireEvent.click(screen.getByText('Codex'))
  expect(screen.getByTestId('probe').textContent).toBe('installed:codex')
})
