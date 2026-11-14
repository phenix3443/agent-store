import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react'
import { useEffect } from 'react'
import { LibraryPage } from '../library/LibraryPage'
import * as rpcModule from '../../lib/rpc'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { TerminalLogProvider, useTerminalLog } from '../../state/TerminalLog'
import { TooltipProvider } from '../ui/tooltip'
import { settleRpc } from '../../test/settle'

afterEach(async () => { cleanup(); await settleRpc(); mock.restore() })

const publisher = { id: 'p', slug: 'x', name: 'vercel', avatarUrl: '', tier: 'community' as const }
const dates = { installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }

const skill = {
  slug: 'skills-find-skills', category: 'skill', version: 'abc123', ...dates, compatibleWith: ['claude', 'codex'],
  enabledFor: { claude: true, codex: false }, resourceId: 'github:vercel-labs/skills/find-skills',
  deployments: { claude: { path: '/home/u/.claude/skills/find-skills', mode: 'symlink', sourceHash: 'h' } },
}
const skillInfo = { ...skill, name: 'find-skills', description: 'Find skills', publisher, tags: [], downloads: 0 }
const mcp = { slug: 'admux', category: 'mcp', version: '1.0.0', ...dates, compatibleWith: ['claude', 'codex'], enabledFor: {}, resourceId: 'mcp-registry:ai.admux/admux' }
const mcpInfo = {
  ...mcp, name: 'admux', description: '', publisher, tags: [], downloads: 0, transport: 'http', url: 'https://admux.example/mcp',
  configSchema: { properties: { token: { description: 'Token', 'x-secret': true, 'x-bearer': true, 'x-env': 'ADMUX_TOKEN' } }, required: ['token'] },
  currentConfig: {},
}

type H = Record<string, (...args: unknown[]) => unknown>
function mockRpc(overrides: H = {}) {
  const calls: { method: string; args: unknown[] }[] = []
  const handlers: H = {
    list: () => [skill, mcp],
    info: (slug) => (slug === 'admux' ? mcpInfo : skillInfo),
    checkUpdates: () => [{ slug: 'skills-find-skills', currentVersion: 'abc123', latestVersion: 'def456' }],
    getTargetStatus: () => [
      { target: 'claude', compatible: true, enabled: false, blocker: { reason: 'needs-config', message: 'token' } },
      { target: 'codex', compatible: true, enabled: false, blocker: { reason: 'needs-config', message: 'token' } },
    ],
    enable: () => undefined,
    disable: () => undefined,
    uninstall: () => undefined,
    update: (slug) => [{ slug, fromVersion: 'abc123', toVersion: 'def456' }],
    setConfig: () => undefined,
    ...overrides,
  }
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push({ method, args })
    return handlers[method]?.(...args)
  }) as typeof rpcModule.callRpc)
  return calls
}

function Log() {
  const { lines } = useTerminalLog()
  return <span data-testid="log">{lines.map((l) => l.text).join('|')}</span>
}

function Select({ slug }: { slug?: string }) {
  const { setSelectedSlug } = useAppState()
  useEffect(() => { if (slug) setSelectedSlug(slug) }, [slug, setSelectedSlug])
  return null
}

function renderLib(kind: 'skill' | 'mcp', slug?: string) {
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <TooltipProvider>
          <Select slug={slug} />
          <LibraryPage kind={kind} />
          <Log />
        </TooltipProvider>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

test('the skill library lists installed skills with one switch per agent and the update', async () => {
  mockRpc()
  renderLib('skill')
  expect(await screen.findByText('find-skills')).toBeInTheDocument()
  expect(screen.queryByText('admux')).toBeNull()
  expect(screen.getByText('~/.agent-store/skills/skills-find-skills')).toBeInTheDocument()
  expect(screen.getByRole('switch', { name: 'Claude Code · find-skills' })).toBeChecked()
  expect(screen.getByRole('switch', { name: 'Codex · find-skills' })).not.toBeChecked()
  expect(screen.getByText('显示 1 / 1 项')).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: '全部更新（1）' })).toBeInTheDocument()
})

test('a switch enables the skill for that agent and logs the command', async () => {
  const calls = mockRpc()
  renderLib('skill')
  fireEvent.click(await screen.findByRole('switch', { name: 'Codex · find-skills' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'enable' && c.args[1] === 'codex')).toBe(true))
  expect(screen.getByTestId('log')).toHaveTextContent('$ aas enable skills-find-skills --for codex')
})

test('a refused skill deploy opens the pane with 强制启用', async () => {
  let n = 0
  const calls = mockRpc({
    enable: (_s, _t, opts) => {
      n += 1
      if (!opts) throw new rpcModule.RpcError('occupied', 'SkillDeployRefusedError', { tool: 'codex' })
    },
  })
  renderLib('skill')
  fireEvent.click(await screen.findByRole('switch', { name: 'Codex · find-skills' }))
  const pane = await screen.findByRole('complementary', { name: 'skills-find-skills' })
  expect(await within(pane).findByText('启用 Codex 失败')).toBeInTheDocument()
  await act(async () => { fireEvent.click(within(pane).getByRole('button', { name: '强制启用' })) })
  await waitFor(() => expect(n).toBe(2))
  expect(calls.filter((c) => c.method === 'enable').at(-1)!.args).toEqual(['skills-find-skills', 'codex', { force: true }])
})

test('the skill pane shows the deployment, the library path and the version', async () => {
  mockRpc()
  renderLib('skill', 'skills-find-skills')
  const pane = await screen.findByRole('complementary', { name: 'skills-find-skills' })
  expect(pane).toHaveTextContent('/home/u/.claude/skills/find-skills · 链接到技能库')
  expect(pane).toHaveTextContent('~/.agent-store/skills/skills-find-skills')
  await waitFor(() => expect(pane).toHaveTextContent('abc123 → def456'))
  expect(within(pane).getByRole('button', { name: '更新到 def456' })).toBeInTheDocument()
})

test('filters narrow the list and the empty result offers to clear them', async () => {
  mockRpc()
  renderLib('skill')
  await screen.findByText('find-skills')
  fireEvent.click(screen.getByRole('button', { name: '未启用' }))
  expect(await screen.findByText('没有符合条件的项')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
  expect(await screen.findByText('find-skills')).toBeInTheDocument()
})

test('an empty library points at Discover', async () => {
  mockRpc({ list: () => [] })
  renderLib('skill')
  expect(await screen.findByText('还没有安装技能')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '浏览技能' })).toBeInTheDocument()
})

test('uninstall asks first, lists what goes, and offers force when refused', async () => {
  let n = 0
  const calls = mockRpc({
    uninstall: (_s, opts) => {
      n += 1
      if (!opts) throw new rpcModule.RpcError('changed', 'SkillConflictError', { reason: 'changed' })
    },
  })
  renderLib('skill', 'skills-find-skills')
  const pane = await screen.findByRole('complementary', { name: 'skills-find-skills' })
  fireEvent.click(within(pane).getByRole('button', { name: '卸载' }))
  const confirm = await screen.findByRole('dialog', { name: '卸载 find-skills' })
  expect(confirm).toHaveTextContent('删除 ~/.agent-store/skills/skills-find-skills')
  expect(confirm).toHaveTextContent('移除 Claude Code 里的链接')
  expect(calls.some((c) => c.method === 'uninstall')).toBe(false)
  await act(async () => { fireEvent.click(within(confirm).getByRole('button', { name: '卸载' })) })
  const failed = await screen.findByRole('dialog', { name: '卸载失败' })
  expect(failed).toHaveTextContent('这个技能的文件在本地被改动过，普通卸载不会删除它们。')
  await act(async () => { fireEvent.click(within(failed).getByRole('button', { name: '强制卸载' })) })
  await waitFor(() => expect(n).toBe(2))
  expect(calls.filter((c) => c.method === 'uninstall').at(-1)!.args).toEqual(['skills-find-skills', { force: true }])
})

test('the MCP library shows the transport, needs-setup and disabled switches with the reason', async () => {
  mockRpc()
  renderLib('mcp')
  expect(await screen.findByText('admux')).toBeInTheDocument()
  expect(await screen.findByText('待配置')).toBeInTheDocument()
  expect(screen.getByText('远程')).toBeInTheDocument()
  expect(screen.getByRole('switch', { name: 'Claude Code · admux' })).toBeDisabled()
})

test('the MCP pane saves its fields after the debounce and says where each agent is written', async () => {
  let status = 'needs-config'
  const calls = mockRpc({
    getTargetStatus: () =>
      status === 'needs-config'
        ? [{ target: 'claude', compatible: true, enabled: false, blocker: { reason: 'needs-config', message: '' } }, { target: 'codex', compatible: true, enabled: false, blocker: { reason: 'needs-config', message: '' } }]
        : [{ target: 'claude', compatible: true, enabled: true }, { target: 'codex', compatible: true, enabled: false }],
    setConfig: () => { status = 'ok' },
  })
  renderLib('mcp', 'admux')
  const pane = await screen.findByRole('complementary', { name: 'admux' })
  expect(pane).toHaveTextContent('填写带 * 的必填项后才能对 agent 启用。')
  const field = within(pane).getByLabelText(/Token/)
  expect(field).toHaveAttribute('type', 'password')
  expect(pane).toHaveTextContent('export ADMUX_TOKEN=…')
  fireEvent.change(field, { target: { value: 'tok' } })
  await waitFor(() => expect(calls.some((c) => c.method === 'setConfig')).toBe(true), { timeout: 1500 })
  expect(calls.find((c) => c.method === 'setConfig')!.args).toEqual(['admux', { token: 'tok' }])
  expect(await within(pane).findByText('~/.claude.json › mcpServers.admux')).toBeInTheDocument()
})

test('an MCP entry changed outside Agent Store explains the refusal', async () => {
  mockRpc({
    getTargetStatus: () => [{ target: 'claude', compatible: true, enabled: true }, { target: 'codex', compatible: true, enabled: false }],
    list: () => [{ ...mcp, enabledFor: { claude: true } }],
    info: () => ({ ...mcpInfo, enabledFor: { claude: true } }),
    disable: () => { throw new rpcModule.RpcError('changed', 'McpChangedOutsideError', { tool: 'claude' }) },
  })
  renderLib('mcp')
  fireEvent.click(await screen.findByRole('switch', { name: 'Claude Code · admux' }))
  const pane = await screen.findByRole('complementary', { name: 'admux' })
  expect(await within(pane).findByText(/在 Agent Store 之外被改动过/)).toBeInTheDocument()
})

const skill2 = { ...skill, slug: 'legacy-skill', resourceId: undefined, enabledFor: { claude: true, codex: true } }
const skill2Info = { ...skill2, name: 'legacy-skill', description: '', publisher, tags: [], downloads: 0 }

test('全部更新 reports each item, and one failing does not stop the rest', async () => {
  const calls = mockRpc({
    list: () => [skill, skill2],
    info: (slug) => (slug === 'legacy-skill' ? skill2Info : skillInfo),
    checkUpdates: () => [
      { slug: 'skills-find-skills', currentVersion: 'abc123', latestVersion: 'def456' },
      { slug: 'legacy-skill', currentVersion: '1.0.0', latestVersion: '1.1.0' },
    ],
    update: (slug) => {
      if (slug === 'skills-find-skills') throw new rpcModule.RpcError('catalog down', 'CatalogUnavailableError')
      return [{ slug, fromVersion: '1.0.0', toVersion: '1.1.0' }]
    },
  })
  renderLib('skill')
  const target1 = await screen.findByRole('button', { name: '全部更新（2）' })
  await act(async () => { fireEvent.click(target1) })
  const results = await screen.findByRole('list', { name: '更新结果' })
  expect(screen.getByText('已更新 1 项，1 项失败')).toBeInTheDocument()
  expect(results).toHaveTextContent('find-skills')
  expect(results).toHaveTextContent('catalog down')
  expect(results).toHaveTextContent('legacy-skillv1.0.0 → v1.1.0')
  expect(calls.filter((c) => c.method === 'update').map((c) => c.args)).toEqual([['skills-find-skills'], ['legacy-skill']])
})

test('selecting rows shows the bulk bar; bulk uninstall confirms, runs one batch and reports each item', async () => {
  const calls = mockRpc({
    list: () => [skill, skill2],
    info: (slug) => (slug === 'legacy-skill' ? skill2Info : skillInfo),
    batch: (ops) => (ops as { action: string; slug: string }[]).map((op) =>
      op.slug === 'legacy-skill' ? { ...op, ok: false, error: { message: 'changed', code: 'SkillConflictError', reason: 'changed' } } : { ...op, ok: true }
    ),
  })
  renderLib('skill')
  await screen.findByText('legacy-skill')
  fireEvent.click(screen.getByRole('checkbox', { name: '全选' }))
  const bar = screen.getByRole('toolbar', { name: '已选 2 项' })
  await act(async () => { fireEvent.click(within(bar).getByRole('button', { name: '卸载' })) })
  const confirm = await screen.findByRole('dialog', { name: '卸载 2 项？' })
  expect(confirm).toHaveTextContent('技能：删除技能库里的目录')
  expect(calls.some((c) => c.method === 'batch')).toBe(false)
  await act(async () => { fireEvent.click(within(confirm).getByRole('button', { name: '卸载' })) })
  const results = await screen.findByRole('dialog', { name: '批量卸载结果' })
  expect(results).toHaveTextContent('1 项成功 · 1 项失败')
  expect(results).toHaveTextContent('这个技能的文件在本地被改动过，普通卸载不会删除它们。')
  expect(calls.filter((c) => c.method === 'batch').map((c) => c.args)).toEqual([[[{ action: 'uninstall', slug: 'skills-find-skills' }, { action: 'uninstall', slug: 'legacy-skill' }]]])
  expect(screen.getByTestId('log')).toHaveTextContent('$ aas uninstall legacy-skill')
})

test('bulkOperations only asks for what changes and leaves out agents an entry does not support', async () => {
  const { bulkOperations } = await import('../library/Bulk')
  const rows = [
    { ...skillInfo, compatibleWith: ['claude', 'codex'], enabledFor: { claude: true, codex: false } },
    { ...skill2Info, compatibleWith: ['claude'], enabledFor: { claude: true } },
  ] as never
  expect(bulkOperations('enable', rows, ['claude', 'codex'])).toEqual([{ action: 'enable', slug: 'skills-find-skills', target: 'codex' }])
  expect(bulkOperations('disable', rows, ['claude'])).toEqual([
    { action: 'disable', slug: 'skills-find-skills', target: 'claude' },
    { action: 'disable', slug: 'legacy-skill', target: 'claude' },
  ])
})

test('a same-name MCP entry offers 替换现有条目, which explains itself and enables with replace', async () => {
  let replaced = false
  const calls = mockRpc({
    getTargetStatus: () => [{ target: 'claude', compatible: true, enabled: replaced }, { target: 'codex', compatible: true, enabled: false }],
    info: () => ({ ...mcpInfo, configSchema: {}, dir: '/home/u/.agent-store/mcps/admux' }),
    enable: (_s, _t, opts) => {
      if (!(opts as { replace?: boolean } | undefined)?.replace) throw new rpcModule.RpcError('exists', 'McpConflictError', { tool: 'claude' })
      replaced = true
    },
  })
  renderLib('mcp')
  const target2 = await screen.findByRole('switch', { name: 'Claude Code · admux' })
  await act(async () => { fireEvent.click(target2) })
  const pane = await screen.findByRole('complementary', { name: 'admux' })
  expect(await within(pane).findByText(/可以替换它/)).toBeInTheDocument()
  fireEvent.click(within(pane).getByRole('button', { name: '替换现有条目' }))
  const dialog = await screen.findByRole('dialog', { name: '替换 Claude Code 里的同名条目？' })
  expect(dialog).toHaveTextContent('把原条目保存到 /home/u/.agent-store/mcps/admux/targets.json')
  expect(dialog).toHaveTextContent('对 Claude Code 停用或卸载这个 MCP 时，把原条目写回并核对')
  expect(dialog).toHaveTextContent('~/.claude.json 里的其他 MCP 条目')
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '替换' })) })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '替换 Claude Code 里的同名条目？' })).toBeNull())
  expect(calls.filter((c) => c.method === 'enable').at(-1)!.args).toEqual(['admux', 'claude', { replace: true }])
  expect(screen.getByTestId('log')).toHaveTextContent('$ aas enable admux --for claude --replace')
})

test('a refused takeover stays in the dialog with the reason', async () => {
  mockRpc({
    getTargetStatus: () => [{ target: 'claude', compatible: true, enabled: false }, { target: 'codex', compatible: true, enabled: false }],
    info: () => ({ ...mcpInfo, configSchema: {} }),
    enable: (_s, _t, opts) => {
      if ((opts as { replace?: boolean } | undefined)?.replace) throw new rpcModule.RpcError('no cli', 'McpNotRestorableError', { tool: 'claude', reason: 'no-cli' })
      throw new rpcModule.RpcError('exists', 'McpConflictError', { tool: 'claude' })
    },
  })
  renderLib('mcp')
  const target3 = await screen.findByRole('switch', { name: 'Claude Code · admux' })
  await act(async () => { fireEvent.click(target3) })
  const pane = await screen.findByRole('complementary', { name: 'admux' })
  fireEvent.click(await within(pane).findByRole('button', { name: '替换现有条目' }))
  const dialog = await screen.findByRole('dialog', { name: '替换 Claude Code 里的同名条目？' })
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '替换' })) })
  expect(await within(dialog).findByText(/没有找到 Claude Code 的命令行/)).toBeInTheDocument()
})

test('uninstalling an MCP that took over an entry says the entry is written back', async () => {
  mockRpc({
    list: () => [{ ...mcp, enabledFor: { claude: true } }],
    info: () => ({ ...mcpInfo, enabledFor: { claude: true }, replacedFor: ['claude'] }),
    getTargetStatus: () => [{ target: 'claude', compatible: true, enabled: true }, { target: 'codex', compatible: true, enabled: false }],
  })
  renderLib('mcp', 'admux')
  const pane = await screen.findByRole('complementary', { name: 'admux' })
  expect(pane).toHaveTextContent('原条目已保存，停用或卸载时写回')
  fireEvent.click(within(pane).getByRole('button', { name: '卸载' }))
  const confirm = await screen.findByRole('dialog', { name: '卸载 admux' })
  expect(confirm).toHaveTextContent('把此前替换掉的原条目写回 Claude Code')
})

test('the skill pane shows the library folder the engine reports and reveals it in the file manager', async () => {
  const reveal = await import('../../lib/reveal')
  const spy = spyOn(reveal, 'revealPath').mockImplementation(async () => {})
  mockRpc({ info: () => ({ ...skillInfo, dir: '/home/u/.agent-store/skills/skills-find-skills' }) })
  renderLib('skill', 'skills-find-skills')
  const pane = await screen.findByRole('complementary', { name: 'skills-find-skills' })
  await waitFor(() => expect(pane).toHaveTextContent('/home/u/.agent-store/skills/skills-find-skills'))
  await act(async () => { fireEvent.click(within(pane).getByRole('button', { name: '在文件管理器中显示 · find-skills' })) })
  expect(spy).toHaveBeenCalledWith('/home/u/.agent-store/skills/skills-find-skills')
})
