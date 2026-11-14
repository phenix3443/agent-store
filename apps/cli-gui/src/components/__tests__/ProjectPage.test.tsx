import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { ProjectsProvider } from '../../state/Projects'
import { TerminalLogProvider, useTerminalLog } from '../../state/TerminalLog'
import { TooltipProvider } from '../ui/tooltip'
import { ProjectPage } from '../projects/ProjectPage'
import { ProjectDialogs } from '../projects/ProjectDialogs'
import { settleRpc } from '../../test/settle'

afterEach(async () => { cleanup(); await settleRpc(); mock.restore() })

const project = { id: 'p1', path: '/w/demo', name: 'demo', addedAt: '2026-11-01T00:00:00Z', exists: true }

function mcpLoc(agent: 'claude' | 'codex', extra: Record<string, unknown> = {}) {
  return {
    agent, scope: 'project', file: agent === 'claude' ? '/w/demo/.mcp.json' : '/w/demo/.codex/config.toml', managed: true, modified: false,
    active: false, overridesUser: true, env: ['ADMUX_TOKEN'], missingEnv: ['ADMUX_TOKEN'], ...(agent === 'claude' ? { approval: 'pending' } : {}), ...extra,
  }
}

function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...project,
    codexTrusted: false,
    skills: [
      {
        kind: 'skill', name: 'pdf-tools', slug: 'pdf-tools', managed: true, agents: ['claude', 'codex'],
        locations: [
          { agent: 'claude', path: '/w/demo/.claude/skills/pdf-tools', managed: true, modified: false },
          { agent: 'codex', path: '/w/demo/.agents/skills/pdf-tools', managed: true, modified: true },
        ],
      },
      { kind: 'skill', name: 'team-notes', managed: false, agents: ['claude'], locations: [{ agent: 'claude', path: '/w/demo/.claude/skills/team-notes', managed: false, modified: false }] },
    ],
    mcps: [
      { kind: 'mcp', name: 'admux', slug: 'admux', version: '1.0.0', managed: true, agents: [], overridesUser: true, missingEnv: ['ADMUX_TOKEN'], locations: [mcpLoc('claude'), mcpLoc('codex')] },
    ],
    env: [{ name: 'ADMUX_TOKEN', stored: false, usedBy: ['admux'] }],
    ...overrides,
  }
}

type H = Record<string, (...args: unknown[]) => unknown>
function mockRpc(overrides: H = {}) {
  const calls: { method: string; args: unknown[] }[] = []
  const handlers: H = {
    listProjects: () => [project],
    getProject: () => makeDetail(),
    list: () => [{ slug: 'admux', category: 'mcp' }],
    setProjectEnv: () => undefined,
    unsetProjectEnv: () => undefined,
    uninstallFromProject: () => ({ removed: [] }),
    removeProject: () => undefined,
    ...overrides,
  }
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) => {
    calls.push({ method, args })
    const h = handlers[method]
    if (!h) throw new Error(`unexpected RPC: ${method}`)
    return h(...args)
  }) as typeof rpcModule.callRpc)
  return calls
}

function Probe() {
  const { navView, projectId, installInto } = useAppState()
  const { lines } = useTerminalLog()
  return (
    <div>
      <span data-testid="nav">{navView}</span>
      <span data-testid="project">{projectId ?? ''}</span>
      <span data-testid="into">{installInto ?? ''}</span>
      <span data-testid="log">{lines.map((l) => l.text).join('|')}</span>
    </div>
  )
}

async function renderPage() {
  render(
    <AppStateProvider>
      <TerminalLogProvider>
        <ProjectsProvider>
          <TooltipProvider>
            <Probe />
            <ProjectPage id="p1" />
            <ProjectDialogs />
          </TooltipProvider>
        </ProjectsProvider>
      </TerminalLogProvider>
    </AppStateProvider>
  )
  await screen.findByRole('heading', { name: 'demo' })
}

test('lists the skills and MCP servers with their source and where each agent reads them', async () => {
  mockRpc()
  await renderPage()
  expect(await screen.findByText('pdf-tools')).toBeInTheDocument()
  const body = document.body
  expect(body).toHaveTextContent('/w/demo')
  expect(body).toHaveTextContent('由 Agent Store 安装')
  expect(body).toHaveTextContent('项目自带')
  expect(body).toHaveTextContent('.claude/skills/pdf-tools')
  expect(body).toHaveTextContent('.agents/skills/pdf-tools')
  expect(body).toHaveTextContent('已改动')
  expect(body).toHaveTextContent('.mcp.json· 待批准：首次使用时 Claude Code 会询问')
  expect(body).toHaveTextContent('.codex/config.toml· 项目未被信任，Codex 不读取')
  expect(body).toHaveTextContent('随版本库提交；密钥的值只存在本机')
  expect(screen.getByRole('button', { name: '卸载 · pdf-tools' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '卸载 · admux' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '卸载 · team-notes' })).not.toBeInTheDocument()
})

test('覆盖全局 opens the explanation under the row', async () => {
  mockRpc()
  await renderPage()
  const chip = await screen.findByRole('button', { name: /覆盖全局/ })
  expect(chip).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(chip)
  expect(chip).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText(/同名时项目覆盖全局/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '查看全局的条目' })).toBeInTheDocument()
})

test('an untrusted project shows the config lines for Codex and does not offer to change them', async () => {
  mockRpc()
  await renderPage()
  const banner = (await screen.findByText('Codex 尚未信任这个项目，项目里的 MCP 对 Codex 不生效')).closest('[role="status"]') as HTMLElement
  expect(banner).toHaveTextContent('[projects."/w/demo"]')
  expect(banner).toHaveTextContent('trust_level = "trusted"')
  expect(banner).toHaveTextContent('Agent Store 不会替你改这项设置')
  expect(within(banner).queryByRole('button', { name: /信任/ })).not.toBeInTheDocument()
})

test('a trusted project has no Codex banner', async () => {
  mockRpc({ getProject: () => makeDetail({ codexTrusted: true }) })
  await renderPage()
  await screen.findByText('pdf-tools')
  expect(screen.queryByText(/Codex 尚未信任/)).not.toBeInTheDocument()
})

test('a missing key is entered here, stored with setProjectEnv and never shown again', async () => {
  const calls = mockRpc()
  await renderPage()
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: '缺少密钥' }))
  })
  const dialog = await screen.findByRole('dialog', { name: '填写 admux 的密钥' })
  expect(dialog).toHaveTextContent('密钥的值只存在本机，不进版本库')
  expect(dialog).toHaveTextContent('${ADMUX_TOKEN}')
  fireEvent.change(within(dialog).getByLabelText('ADMUX_TOKEN'), { target: { value: 'sk-live-1' } })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(calls.filter((c) => c.method === 'setProjectEnv')).toEqual([{ method: 'setProjectEnv', args: ['p1', 'ADMUX_TOKEN', 'sk-live-1'] }])
  expect(document.body.textContent).not.toContain('sk-live-1')
})

test('the 密钥 list says how agents get the values, and clears a stored one', async () => {
  const calls = mockRpc({
    getProject: () =>
      makeDetail({
        mcps: [{ ...makeDetail().mcps[0], missingEnv: [], locations: [mcpLoc('claude', { missingEnv: [] })] }],
        env: [{ name: 'ADMUX_TOKEN', stored: true, usedBy: ['admux'] }],
      }),
  })
  await renderPage()
  expect(await screen.findByText('已存在本机')).toBeInTheDocument()
  expect(screen.getByText('aas projects exec . -- claude')).toBeInTheDocument()
  expect(screen.getByText('eval "$(aas projects env .)"')).toBeInTheDocument()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '清除' }))
  })
  expect(calls.filter((c) => c.method === 'unsetProjectEnv')).toEqual([{ method: 'unsetProjectEnv', args: ['p1', 'ADMUX_TOKEN'] }])
})

test('uninstalling lists what changes in the project, and an edited entry needs 仍然卸载', async () => {
  let n = 0
  const calls = mockRpc({
    uninstallFromProject: () => {
      n += 1
      if (n === 1) throw new rpcModule.RpcError('edited; pass --force', 'ProjectConflictError', { reason: 'modified', tool: 'codex' })
      return { removed: [] }
    },
  })
  await renderPage()
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: '卸载 · admux' }))
  })
  const dialog = await screen.findByRole('dialog', { name: '从项目 demo 卸载 admux' })
  expect(dialog).toHaveTextContent('从 .mcp.json 移除这条 MCP')
  expect(dialog).toHaveTextContent('从 .codex/config.toml 移除这条 MCP')
  expect(dialog).toHaveTextContent('之后这个项目改用全局的 admux')
  expect(dialog).toHaveTextContent('本机保存的密钥值保留')
  expect(dialog).toHaveTextContent('提交到版本库后队友才会同步')
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: '卸载' }))
  })
  expect(await within(dialog).findByText(/Agent Store 写入的 Codex 条目之后被改过，没有删除/)).toBeInTheDocument()
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: '仍然卸载' }))
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(calls.filter((c) => c.method === 'uninstallFromProject').map((c) => c.args)).toEqual([['p1', 'admux'], ['p1', 'admux', { force: true }]])
})

test('a folder that is gone offers to locate or remove the project and nothing else', async () => {
  mockRpc({
    listProjects: () => [{ ...project, exists: false }],
    getProject: () => ({ ...project, exists: false, codexTrusted: false, skills: [], mcps: [], env: [] }),
  })
  await renderPage()
  expect(await screen.findByText('找不到项目目录')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '添加到这个项目' })).toBeDisabled()
  expect(screen.getAllByRole('button', { name: '重新定位' })).toHaveLength(2)
  expect(screen.queryByText('pdf-tools')).not.toBeInTheDocument()
})

test('移除项目 asks first, naming the stored keys that go with it', async () => {
  const calls = mockRpc({
    getProject: () => makeDetail({ env: [{ name: 'ADMUX_TOKEN', stored: true, usedBy: ['admux'] }, { name: 'OTHER', stored: true, usedBy: [] }] }),
  })
  await renderPage()
  await screen.findByText('pdf-tools')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '移除项目' }))
  })
  const dialog = await screen.findByRole('dialog', { name: '移除项目 demo' })
  expect(dialog).toHaveTextContent('不删除任何文件')
  expect(dialog).toHaveTextContent('删除本机为这个项目保存的 2 个密钥值')
  expect(dialog).toHaveTextContent('项目里的技能、MCP 配置保持原样，agent 照常使用')
  expect(calls.filter((c) => c.method === 'removeProject')).toHaveLength(0)
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: '移除项目' }))
  })
  expect(calls.filter((c) => c.method === 'removeProject')).toEqual([{ method: 'removeProject', args: ['p1'] }])
})

test('添加到这个项目 opens Discover with the project preset', async () => {
  mockRpc()
  await renderPage()
  await screen.findByText('pdf-tools')
  fireEvent.click(screen.getByRole('button', { name: '添加到这个项目' }))
  expect(screen.getByTestId('nav')).toHaveTextContent('browse')
  expect(screen.getByTestId('into')).toHaveTextContent('p1')
})

test('a project without items of its own says so', async () => {
  mockRpc({ getProject: () => makeDetail({ skills: [], mcps: [], env: [] }) })
  await renderPage()
  expect(await screen.findByText('这个项目还没有项目级的技能或 MCP')).toBeInTheDocument()
})

test('a failed read offers a retry', async () => {
  let n = 0
  mockRpc({
    getProject: () => {
      n += 1
      if (n === 1) throw new Error('EACCES: /w/demo/.mcp.json')
      return makeDetail()
    },
  })
  await renderPage()
  expect(await screen.findByText('读取项目失败')).toBeInTheDocument()
  expect(document.body).toHaveTextContent('EACCES')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
  })
  expect(await screen.findByText('pdf-tools')).toBeInTheDocument()
})

test('a project that is no longer registered says so', async () => {
  mockRpc({
    listProjects: () => [],
    getProject: () => {
      throw new rpcModule.RpcError('No registered project matches', 'ProjectNotFoundError', { reason: 'project-not-found' })
    },
  })
  render(
    <AppStateProvider>
      <TerminalLogProvider>
        <ProjectsProvider>
          <ProjectPage id="p9" />
        </ProjectsProvider>
      </TerminalLogProvider>
    </AppStateProvider>
  )
  expect(await screen.findByText('没有这个项目')).toBeInTheDocument()
})
