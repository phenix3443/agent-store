import { test, expect, afterEach, beforeEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

mock.module('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
  }),
}))

beforeEach(() => { localStorage.clear() })
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

test('submitting POSTs to the API server and closes the modal on success', async () => {
  const originalFetch = globalThis.fetch
  let sentUrl = ''
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    sentUrl = String(url)
    return new Response(JSON.stringify({ success: true }), { status: 201 })
  }) as typeof fetch

  const onOpenChange = mock(() => {})
  renderModal(onOpenChange)
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Provider' } })
  fireEvent.click(screen.getByText('发布'))

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(sentUrl.endsWith('/api/items')).toBe(true)

  globalThis.fetch = originalFetch
})

test('mcp http submits headers as parsed JSON in the request body', async () => {
  const originalFetch = globalThis.fetch
  let sentBody: { metadata?: { headers?: Record<string, string> } } | undefined
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    sentBody = JSON.parse(init?.body as string)
    return new Response(JSON.stringify({ success: true }), { status: 201 })
  }) as typeof fetch

  renderModal()
  fireEvent.click(screen.getByText('MCP'))
  fireEvent.change(screen.getByLabelText('传输方式'), { target: { value: 'http' } })
  fireEvent.change(screen.getByLabelText('远程地址'), { target: { value: 'https://example.com/mcp' } })
  fireEvent.change(screen.getByLabelText('Headers（JSON）'), { target: { value: '{"Authorization": "Bearer xyz"}' } })
  fireEvent.click(screen.getByText('发布'))

  await waitFor(() => expect(sentBody?.metadata?.headers).toEqual({ Authorization: 'Bearer xyz' }))

  globalThis.fetch = originalFetch
})
