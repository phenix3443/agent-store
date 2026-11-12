import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { McpConfigPanel } from '../McpConfigPanel'
import * as rpcModule from '../../lib/rpc'

afterEach(() => { cleanup(); mock.restore() })

const publisher = { id: 'p', slug: 'gh', name: 'gh', avatarUrl: '', tier: 'official' as const }

const info = {
  slug: 'github', category: 'mcp', version: '0.6.2', installedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude', 'codex'], enabledFor: {},
  name: 'github', description: 'GitHub API', publisher, tags: [], downloads: 0,
  configSchema: {
    type: 'object',
    properties: {
      token: { type: 'string', description: 'GitHub token', 'x-env': 'GITHUB_TOKEN', 'x-bearer': true },
      host: { type: 'string', description: 'API host', default: 'api.github.com' },
    },
    required: ['token'],
  },
  currentConfig: {},
}

type Status = Array<{ target: string; compatible: boolean; enabled: boolean; blocker?: { reason: string; message: string } }>
const needsConfig: Status = [
  { target: 'claude', compatible: true, enabled: false, blocker: { reason: 'needs-config', message: 'missing token' } },
  { target: 'codex', compatible: true, enabled: false, blocker: { reason: 'needs-config', message: 'missing token' } },
]
const ready: Status = [
  { target: 'claude', compatible: true, enabled: false },
  { target: 'codex', compatible: false, enabled: false, blocker: { reason: 'incompatible', message: 'no codex' } },
]

function renderPanel(handlers: Record<string, (...args: unknown[]) => unknown>) {
  const calls: Array<[string, unknown[]]> = []
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push([method, args])
    return handlers[method]?.(...args)
  }) as typeof rpcModule.callRpc)
  render(<McpConfigPanel slug="github" onClose={() => {}} />)
  return calls
}

test('renders a field per schema property, required first, with the needs-config warning', async () => {
  renderPanel({ info: () => info, getTargetStatus: () => needsConfig })
  const token = await screen.findByLabelText(/GitHub token/)
  const host = screen.getByLabelText(/API host/)
  expect(token.compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('填写带 * 的必填项')
  expect(screen.getByText('export GITHUB_TOKEN=…')).toBeInTheDocument()
  // Enabling is offered only once the required value is in.
  expect(screen.getByLabelText('Claude Code')).toBeDisabled()
})

test('typing saves the config, then the refreshed status unlocks the client', async () => {
  let status = needsConfig
  const setConfig = mock((_slug: unknown, values: unknown) => { status = ready; return values })
  const calls = renderPanel({ info: () => info, getTargetStatus: () => status, setConfig })
  fireEvent.change(await screen.findByLabelText(/GitHub token/), { target: { value: 'ghp_1' } })
  await waitFor(() => expect(setConfig).toHaveBeenCalledWith('github', { token: 'ghp_1' }), { timeout: 2000 })
  await waitFor(() => expect(screen.getByLabelText('Claude Code')).not.toBeDisabled())
  expect(screen.getByLabelText('Codex')).toBeDisabled()
  expect(screen.getByLabelText('Codex')).toHaveAttribute('title', '不支持该客户端')
  expect(calls.filter(([m]) => m === 'getTargetStatus').length).toBeGreaterThan(1)
})

test('toggling a client calls enable and shows it enabled', async () => {
  let status: Status = ready
  const enable = mock(() => { status = [{ ...ready[0], enabled: true }, ready[1]] })
  renderPanel({ info: () => ({ ...info, currentConfig: { token: 't' } }), getTargetStatus: () => status, enable })
  await waitFor(() => expect(screen.getByLabelText('Claude Code')).not.toBeDisabled())
  fireEvent.click(screen.getByLabelText('Claude Code'))
  await waitFor(() => expect(enable).toHaveBeenCalledWith('github', 'claude'))
  await waitFor(() => expect(screen.getByLabelText('Claude Code')).toHaveAttribute('aria-pressed', 'true'))
})

test('disabling an enabled client calls disable', async () => {
  const enabled: Status = [{ ...ready[0], enabled: true }, ready[1]]
  const disable = mock(() => undefined)
  renderPanel({ info: () => info, getTargetStatus: () => enabled, disable })
  await waitFor(() => expect(screen.getByLabelText('Claude Code')).toHaveAttribute('aria-pressed', 'true'))
  fireEvent.click(screen.getByLabelText('Claude Code'))
  await waitFor(() => expect(disable).toHaveBeenCalledWith('github', 'claude'))
})

test('a refused enable shows the engine reason', async () => {
  const enable = mock(async () => { throw new Error('Claude Code already has an MCP server named "github" that Agent Store did not write') })
  renderPanel({ info: () => info, getTargetStatus: () => ready, enable })
  await waitFor(() => expect(screen.getByLabelText('Claude Code')).not.toBeDisabled())
  fireEvent.click(screen.getByLabelText('Claude Code'))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('启用 Claude Code 失败')
  expect(alert.textContent).toContain('did not write')
})

test('a refused save shows the reason', async () => {
  const setConfig = mock(async () => { throw new Error('changed outside Agent Store') })
  renderPanel({ info: () => info, getTargetStatus: () => ready, setConfig })
  fireEvent.change(await screen.findByLabelText(/GitHub token/), { target: { value: 'x' } })
  const alert = await screen.findByRole('alert', {}, { timeout: 2000 })
  expect(alert.textContent).toContain('保存失败')
  expect(alert.textContent).toContain('changed outside Agent Store')
})

test('an MCP without a schema says it needs no configuration', async () => {
  renderPanel({ info: () => ({ ...info, configSchema: { type: 'object' } }), getTargetStatus: () => ready })
  expect(await screen.findByText(/这个 MCP 不需要配置/)).toBeInTheDocument()
})

test('a same-name entry in the tool is explained, with the engine text as detail', async () => {
  const raw = 'Claude Code already has an MCP server named "github" that Agent Store did not write; nothing was changed. Rename or remove it, or enable with --replace'
  const enable = mock(async () => { throw new rpcModule.RpcError(raw, 'McpConflictError', { tool: 'claude' }) })
  renderPanel({ info: () => info, getTargetStatus: () => ready, enable })
  await waitFor(() => expect(screen.getByLabelText('Claude Code')).not.toBeDisabled())
  fireEvent.click(screen.getByLabelText('Claude Code'))
  const alert = await screen.findByRole('alert')
  const lead = alert.textContent!.split('详细信息')[0]
  expect(lead).toContain('Claude Code 里已经有一条同名的 MCP 配置')
  expect(lead).not.toContain('--replace')
  expect(alert.querySelector('details pre')?.textContent).toBe(raw)
})
