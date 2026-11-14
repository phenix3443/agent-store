import { test, expect, afterEach, beforeEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { AgentDetection, ImportScan } from '@as/types'
import * as persistence from '../../state/LocalPersistence'
import * as rpcModule from '../../lib/rpc'
import { settleRpc } from '../../test/settle'
import { WelcomeDialog, useFirstRunWelcome } from '../WelcomeDialog'
import { AppStateProvider, useAppState } from '../../state/AppState'

let stored: unknown = null
let readFails = false
const writes: unknown[] = []
let calls: [string, unknown[]][] = []

const AGENTS_FOUND: AgentDetection[] = [
  { agent: 'claude', binary: '/usr/bin/claude', version: '2.1.80 (Claude Code)', configDir: '/h/.claude', configDirExists: true, mcpConfigPath: '/h/.claude.json', mcpConfigExists: true, detected: true },
  { agent: 'codex', binary: null, version: null, configDir: '/h/.codex', configDirExists: false, mcpConfigPath: '/h/.codex/config.toml', mcpConfigExists: false, detected: false },
]

const SCAN: ImportScan = {
  agents: AGENTS_FOUND,
  skills: [
    { kind: 'skill', id: 'skill:notes', dirName: 'notes', name: 'notes', description: null, locations: [{ agent: 'claude', root: 'claude', path: '/h/.claude/skills/notes' }], contentHash: 'h', files: 1, importable: true },
    { kind: 'skill', id: 'skill:shared', dirName: 'shared', name: 'shared', description: null, locations: [{ agent: 'codex', root: 'agents', path: '/h/.agents/skills/shared' }], contentHash: 'h2', files: 1, importable: true },
    { kind: 'skill', id: 'skill:linked', dirName: 'linked', name: 'linked', description: null, locations: [{ agent: 'claude', root: 'claude', path: '/h/.claude/skills/linked', linkTarget: '/dot/linked' }], contentHash: null, files: 0, importable: false, reason: 'symlink' },
  ],
  mcps: [{ kind: 'mcp', id: 'mcp:github', name: 'github', importable: true, entries: [{ agent: 'claude', path: '/h/.claude.json', transport: 'stdio', command: 'npx', args: ['-y', 'pkg', '--token=***'], envNames: ['GITHUB_TOKEN'], headerNames: [], lossyKeys: [] }] }],
  catalogChecked: true,
  problems: [],
}

function mockRpc(scan: ImportScan = SCAN) {
  calls = []
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push([method, args])
    if (method === 'detectAgents') return AGENTS_FOUND
    if (method === 'importScan') return scan
    if (method === 'importApply') return { importId: 'imp-1', items: (args[0] as string[]).map((id) => ({ kind: id.split(':')[0], id, slug: id.split(':')[1], agents: ['claude'], paths: [] })) }
    if (method === 'importUndo') return { importId: 'imp-1', items: [] }
    throw new Error(`unexpected RPC ${method}`)
  }) as typeof rpcModule.callRpc)
}

beforeEach(() => {
  spyOn(persistence, 'readLocalState').mockImplementation((async (_key: string, fallback: unknown) => {
    if (readFails) throw new Error('no app data dir')
    return stored ?? fallback
  }) as typeof persistence.readLocalState)
  spyOn(persistence, 'writeLocalState').mockImplementation((async (_key: string, value: unknown) => {
    writes.push(value)
    stored = value
  }) as typeof persistence.writeLocalState)
  mockRpc()
})

afterEach(async () => {
  cleanup()
  await settleRpc()
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

const written = () => calls.filter(([m]) => m === 'importApply' || m === 'importUndo')

test('opens on the first launch with what was detected for each agent', async () => {
  render(<AppStateProvider><Shell /></AppStateProvider>)
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent('Agent 所需，尽在于此')
  expect(await screen.findByText('2.1.80 (Claude Code)')).toBeInTheDocument()
  expect(screen.getByText('已检测到')).toBeInTheDocument()
  expect(screen.getByText('未检测到')).toBeInTheDocument()
  expect(dialog).toHaveTextContent('没有找到 codex 命令和 /h/.codex。启用的内容照样写入，装好后即可读到。')
  expect(screen.getByRole('button', { name: '继续' })).toHaveFocus()
})

test('lists what the user already has; nothing is written until 导入所选, and skipping writes nothing', async () => {
  render(<AppStateProvider><Shell /></AppStateProvider>)
  fireEvent.click(await screen.findByRole('button', { name: '继续' }))
  expect(await screen.findByText('发现已有的技能和 MCP')).toBeInTheDocument()
  const [match, ...boxes] = screen.getAllByRole('checkbox') as HTMLInputElement[]
  expect(match.checked).toBe(false)
  expect(match.closest('label')).toHaveTextContent('与 Agent Store 目录对照')
  expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([[true, false], [false, false], [false, true], [true, false]])
  expect(screen.getByText('其他工具也读取 ~/.agents/skills，默认不勾选；导入后这里会换成指向技能库的链接。')).toBeInTheDocument()
  expect(calls.filter(([m]) => m === 'importScan').map(([, a]) => a)).toEqual([[{ matchCatalog: false }]])
  expect(screen.getByText('是指向 /dot/linked 的链接，请在原处管理')).toBeInTheDocument()
  expect(screen.getByText('环境变量 GITHUB_TOKEN')).toBeInTheDocument()
  expect(screen.getByText('npx -y pkg --token=***')).toBeInTheDocument()
  expect(written()).toEqual([])

  fireEvent.click(screen.getByRole('button', { name: '跳过' }))
  expect(await screen.findByText('准备就绪')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '开始使用' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(written()).toEqual([])
  expect(writes).toHaveLength(1)
  expect(screen.getByTestId('nav').textContent).toBe('browse:all')
})

test('imports only what is checked, then offers the undo', async () => {
  render(<AppStateProvider><Shell /></AppStateProvider>)
  fireEvent.click(await screen.findByRole('button', { name: '继续' }))
  await screen.findByText('发现已有的技能和 MCP')
  fireEvent.click(screen.getAllByRole('checkbox')[4])
  fireEvent.click(screen.getByRole('button', { name: '导入所选（1）' }))
  expect(await screen.findByText('已导入 1 项')).toBeInTheDocument()
  expect(calls.find(([m]) => m === 'importApply')![1]).toEqual([['skill:notes'], { matchCatalog: false }])

  fireEvent.click(screen.getByRole('button', { name: '撤销这次导入' }))
  expect(await screen.findByText('已撤销，文件恢复到导入前的状态')).toBeInTheDocument()
  expect(calls.find(([m]) => m === 'importUndo')![1]).toEqual(['imp-1', {}])
})

test('comparing with the catalog is opt-in: checking it scans again with matchCatalog and imports with it', async () => {
  render(<AppStateProvider><Shell /></AppStateProvider>)
  fireEvent.click(await screen.findByRole('button', { name: '继续' }))
  await screen.findByText('notes')
  fireEvent.click(screen.getAllByRole('checkbox')[0])
  await waitFor(() => expect(calls.filter(([m]) => m === 'importScan').map(([, a]) => a)).toEqual([[{ matchCatalog: false }], [{ matchCatalog: true }]]))
  fireEvent.click(await screen.findByRole('button', { name: '导入所选（2）' }))
  await screen.findByText('已导入 2 项')
  expect(calls.find(([m]) => m === 'importApply')![1]).toEqual([['skill:notes', 'mcp:github'], { matchCatalog: true }])
})

test('with nothing to import, 继续 goes straight to the end', async () => {
  mock.restore()
  mockRpc({ ...SCAN, skills: [], mcps: [] })
  spyOn(persistence, 'readLocalState').mockImplementation((async (_k: string, f: unknown) => f) as typeof persistence.readLocalState)
  render(<AppStateProvider><Shell /></AppStateProvider>)
  await screen.findByText('2.1.80 (Claude Code)')
  await settleRpc()
  fireEvent.click(screen.getByRole('button', { name: '继续' }))
  expect(await screen.findByText('准备就绪')).toBeInTheDocument()
  expect(screen.queryByText('发现已有的技能和 MCP')).toBeNull()
})

test('Escape also records it, so it does not come back on the next launch', async () => {
  render(<AppStateProvider><Shell /></AppStateProvider>)
  await screen.findByRole('dialog')
  await new Promise((r) => setTimeout(r, 20))
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(written()).toEqual([])
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
