import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import * as rpcModule from '../lib/rpc'
import { App } from '../App'

afterEach(() => { cleanup(); mock.restore() })

test('renders the icon rail, resource list, empty detail state, and collapsed terminal', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return []
    if (method === 'search') return []
    throw new Error(`unexpected RPC in smoke test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<App />)

  expect(screen.getByLabelText('浏览商店')).toBeInTheDocument()
  expect(screen.getByPlaceholderText('搜索，或用 @ 过滤…')).toBeInTheDocument()
  expect(screen.getByText('从左侧选择一个资源查看详情')).toBeInTheDocument()
  expect(screen.getByLabelText('展开终端')).toBeInTheDocument()
  expect(screen.queryByText('浏览')).not.toBeInTheDocument()
})
