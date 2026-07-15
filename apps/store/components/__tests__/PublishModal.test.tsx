import { test, expect, afterEach, beforeEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

beforeEach(() => {
  localStorage.clear()
  // Publish reads the signed-in user's GitHub login from the Neon Auth session proxy.
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ user: { name: 'tester' } }) })) as unknown as typeof fetch
})
afterEach(() => { cleanup() })

const { PublishModal } = await import('../PublishModal')
const { ClientStateProvider } = await import('../ClientStateProvider')

function renderModal(onOpenChange: (open: boolean) => void = () => {}) {
  return render(
    <ClientStateProvider>
      <PublishModal open onOpenChange={onOpenChange} />
    </ClientStateProvider>
  )
}

test('defaults to provider fields', () => {
  renderModal()
  expect(screen.getByLabelText('Base URL')).toBeInTheDocument()
})

test('switching type to mcp swaps the visible fields', () => {
  renderModal()
  fireEvent.click(screen.getByText('MCP'))
  expect(screen.queryByLabelText('Base URL')).not.toBeInTheDocument()
  expect(screen.getByLabelText('传输方式')).toBeInTheDocument()
})

test('mcp transport=stdio shows command field, hides url field', () => {
  renderModal()
  fireEvent.click(screen.getByText('MCP'))
  fireEvent.change(screen.getByLabelText('传输方式'), { target: { value: 'stdio' } })
  expect(screen.getByLabelText('启动命令')).toBeInTheDocument()
  expect(screen.queryByLabelText('远程地址')).not.toBeInTheDocument()
})

test('submitting opens a GitHub prefilled new-file page for the registry', async () => {
  const opened: string[] = []
  const originalOpen = window.open
  window.open = ((url?: string | URL) => { opened.push(String(url)); return null }) as typeof window.open

  const onOpenChange = mock(() => {})
  renderModal(onOpenChange)
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Provider' } })
  fireEvent.click(screen.getByText('发布'))

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(opened[0]).toContain('github.com/awesome-agent-store/registry/new/main')
  expect(opened[0]).toContain('provider%2Fmy-provider.json')

  window.open = originalOpen
})

test('mcp http encodes parsed headers into the prefilled manifest', async () => {
  const opened: string[] = []
  const originalOpen = window.open
  window.open = ((url?: string | URL) => { opened.push(String(url)); return null }) as typeof window.open

  renderModal()
  fireEvent.click(screen.getByText('MCP'))
  fireEvent.change(screen.getByLabelText('传输方式'), { target: { value: 'http' } })
  fireEvent.change(screen.getByLabelText('远程地址'), { target: { value: 'https://example.com/mcp' } })
  fireEvent.change(screen.getByLabelText('Headers（JSON）'), { target: { value: '{"Authorization": "Bearer xyz"}' } })
  fireEvent.click(screen.getByText('发布'))

  await waitFor(() => expect(opened.length).toBe(1))
  expect(decodeURIComponent(opened[0])).toContain('"Authorization": "Bearer xyz"')

  window.open = originalOpen
})
