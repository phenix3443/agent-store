import { test, expect, afterEach, beforeEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup() })

const { PublishModal } = await import('../PublishModal')
const { ClientStateProvider, useClientState } = await import('../ClientStateProvider')

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

test('submitting closes the modal', () => {
  const onOpenChange = mock(() => {})
  renderModal(onOpenChange)
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Provider' } })
  fireEvent.click(screen.getByText('发布'))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('mcp transport=http submits headers as parsed JSON on the built item', () => {
  let latestItems: import('@aas/types').Item[] = []
  function Probe() {
    const { userItems } = useClientState()
    latestItems = userItems
    return null
  }

  render(
    <ClientStateProvider>
      <PublishModal open onOpenChange={() => {}} />
      <Probe />
    </ClientStateProvider>
  )

  fireEvent.click(screen.getByText('MCP'))
  fireEvent.change(screen.getByLabelText('传输方式'), { target: { value: 'http' } })
  fireEvent.change(screen.getByLabelText('远程地址'), { target: { value: 'https://example.com/mcp' } })
  fireEvent.change(screen.getByLabelText('Headers（JSON）'), {
    target: { value: '{"Authorization": "Bearer xyz"}' },
  })
  fireEvent.click(screen.getByText('发布'))

  expect(latestItems[0]).toMatchObject({ headers: { Authorization: 'Bearer xyz' } })
})
