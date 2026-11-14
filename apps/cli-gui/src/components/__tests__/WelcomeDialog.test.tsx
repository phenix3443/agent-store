import { test, expect, afterEach, beforeEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import * as persistence from '../../state/LocalPersistence'
import { WelcomeDialog, useFirstRunWelcome } from '../WelcomeDialog'
import { AppStateProvider, useAppState } from '../../state/AppState'

let stored: unknown = null
let readFails = false
const writes: unknown[] = []

beforeEach(() => {
  spyOn(persistence, 'readLocalState').mockImplementation((async (_key: string, fallback: unknown) => {
    if (readFails) throw new Error('no app data dir')
    return stored ?? fallback
  }) as typeof persistence.readLocalState)
  spyOn(persistence, 'writeLocalState').mockImplementation((async (_key: string, value: unknown) => {
    writes.push(value)
    stored = value
  }) as typeof persistence.writeLocalState)
})

afterEach(() => {
  cleanup()
  mock.restore()
  stored = null
  readFails = false
  writes.length = 0
})

function Probe() {
  const { navView, categoryFilter } = useAppState()
  return <div data-testid="nav">{`${navView}:${categoryFilter}`}</div>
}

function Shell() {
  useFirstRunWelcome()
  return (
    <>
      <WelcomeDialog />
      <Probe />
    </>
  )
}

test('opens on the first launch, lists the supported agents and makes no detection claim', async () => {
  render(<AppStateProvider><Shell /></AppStateProvider>)
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent('Agent 所需，尽在于此')
  expect(screen.getByText('Claude Code')).toBeInTheDocument()
  expect(screen.getByText('Codex')).toBeInTheDocument()
  expect(screen.getByText('已支持 Claude Code、Codex，更多 agent 陆续加入。')).toBeInTheDocument()
  expect(dialog.textContent).not.toMatch(/检测/)
  expect(screen.getByRole('button', { name: '开始使用' })).toHaveFocus()
})

test('开始使用 records it, closes and goes to Discover', async () => {
  render(<AppStateProvider><Shell /></AppStateProvider>)
  fireEvent.click(await screen.findByRole('button', { name: '开始使用' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(writes).toHaveLength(1)
  expect(screen.getByTestId('nav').textContent).toBe('browse:all')
})

test('Escape also records it, so it does not come back on the next launch', async () => {
  render(<AppStateProvider><Shell /></AppStateProvider>)
  await screen.findByRole('dialog')
  await new Promise((r) => setTimeout(r, 20))
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
  await waitFor(() => expect(writes).toHaveLength(1))
})

test('stays closed once seen, or when the app data dir cannot be read', async () => {
  stored = { seenAt: '2026-11-13T00:00:00Z' }
  const { unmount } = render(<AppStateProvider><Shell /></AppStateProvider>)
  await new Promise((r) => setTimeout(r, 10))
  expect(screen.queryByRole('dialog')).toBeNull()
  unmount()

  stored = null
  readFails = true
  render(<AppStateProvider><Shell /></AppStateProvider>)
  await new Promise((r) => setTimeout(r, 10))
  expect(screen.queryByRole('dialog')).toBeNull()
})
