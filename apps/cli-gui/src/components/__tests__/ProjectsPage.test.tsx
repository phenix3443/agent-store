import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import * as picker from '../../lib/folderPicker'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { ProjectsProvider, useProjects } from '../../state/Projects'
import { TerminalLogProvider } from '../../state/TerminalLog'
import { ProjectsPage } from '../projects/ProjectsPage'
import { ProjectDialogs } from '../projects/ProjectDialogs'
import { settleRpc } from '../../test/settle'

afterEach(async () => { cleanup(); await settleRpc(); mock.restore() })

const demo = { id: 'p1', path: '/w/demo', name: 'demo', addedAt: '2026-11-01T00:00:00Z', exists: true }
const gone = { id: 'p2', path: '/w/gone', name: 'gone', addedAt: '2026-11-01T00:00:00Z', exists: false }

type H = Record<string, (...args: unknown[]) => unknown>
function mockRpc(overrides: H = {}) {
  const calls: { method: string; args: unknown[] }[] = []
  const handlers: H = {
    listProjects: () => [demo, gone],
    getProject: (id) =>
      id === 'p1'
        ? {
            ...demo, codexTrusted: true, env: [],
            skills: [{ kind: 'skill', name: 's', managed: false, agents: ['claude'], locations: [] }],
            mcps: [{ kind: 'mcp', name: 'm', managed: true, agents: [], overridesUser: false, missingEnv: ['TOKEN'], locations: [] }],
          }
        : { ...gone, codexTrusted: false, skills: [], mcps: [], env: [] },
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
  const { navView, projectId } = useAppState()
  const { openDialog, projects } = useProjects()
  return (
    <div>
      <span data-testid="nav">{navView}</span>
      <span data-testid="project">{projectId ?? ''}</span>
      <button type="button" onClick={() => openDialog({ kind: 'relocate', project: projects[0] })}>
        open-relocate
      </button>
    </div>
  )
}

function renderPage() {
  render(
    <AppStateProvider>
      <TerminalLogProvider>
        <ProjectsProvider>
          <Probe />
          <ProjectsPage />
          <ProjectDialogs />
        </ProjectsProvider>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

test('lists each project with its path, item count and what needs attention', async () => {
  mockRpc()
  renderPage()
  const list = await screen.findByLabelText('项目')
  expect(await within(list).findByText('2 项')).toBeInTheDocument()
  expect(list).toHaveTextContent('/w/demo')
  expect(list).toHaveTextContent('缺少密钥')
  expect(list).toHaveTextContent('目录不存在')
  fireEvent.click(within(list).getByRole('button', { name: /demo/ }))
  expect(screen.getByTestId('nav')).toHaveTextContent('project')
  expect(screen.getByTestId('project')).toHaveTextContent('p1')
})

test('no projects yet offers to add one', async () => {
  mockRpc({ listProjects: () => [] })
  renderPage()
  expect(await screen.findByText('还没有项目')).toBeInTheDocument()
  expect(screen.getByText(/全局安装的内容对所有项目生效/)).toBeInTheDocument()
})

test('a list that cannot be read shows the reason and a retry', async () => {
  let n = 0
  mockRpc({
    listProjects: () => {
      n += 1
      if (n === 1) throw new Error('projects.json: unexpected shape')
      return [demo]
    },
  })
  renderPage()
  expect(await screen.findByText('没有读到项目列表')).toBeInTheDocument()
  expect(document.body).toHaveTextContent('unexpected shape')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
  })
  expect(await screen.findByText('demo')).toBeInTheDocument()
})

test('添加项目 takes a folder from the system picker and opens the new project', async () => {
  const added = { id: 'p3', path: '/w/picked', name: 'Picked', addedAt: '2026-11-14T00:00:00Z', exists: true }
  const calls = mockRpc({ listProjects: () => [], addProject: () => added })
  const pick = spyOn(picker, 'pickFolder').mockResolvedValue('/w/picked')
  renderPage()
  await act(async () => {
    fireEvent.click((await screen.findAllByRole('button', { name: '添加项目' }))[0])
  })
  const dialog = await screen.findByRole('dialog', { name: '添加项目' })
  expect(dialog).toHaveTextContent('添加只是登记，不会改动目录里的文件')
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: '选择目录…' }))
  })
  expect(pick).toHaveBeenCalledTimes(1)
  expect(within(dialog).getByLabelText('项目目录')).toHaveValue('/w/picked')
  fireEvent.change(within(dialog).getByLabelText('名称（可选）'), { target: { value: 'Picked' } })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: '添加项目' }))
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(calls.filter((c) => c.method === 'addProject')).toEqual([{ method: 'addProject', args: ['/w/picked', { name: 'Picked' }] }])
  expect(screen.getByTestId('project')).toHaveTextContent('p3')
})

test('a relative path is refused before anything is called', async () => {
  const calls = mockRpc({ listProjects: () => [] })
  renderPage()
  await act(async () => {
    fireEvent.click((await screen.findAllByRole('button', { name: '添加项目' }))[0])
  })
  const dialog = await screen.findByRole('dialog', { name: '添加项目' })
  fireEvent.change(within(dialog).getByLabelText('项目目录'), { target: { value: 'code/repo' } })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: '添加项目' }))
  })
  expect(within(dialog).getByRole('alert')).toHaveTextContent('请填写目录的完整路径')
  expect(calls.filter((c) => c.method === 'addProject')).toHaveLength(0)
})

test('a folder registered already names that project and opens it', async () => {
  mockRpc({
    addProject: () => {
      throw new rpcModule.RpcError('/w/demo is already registered', 'ProjectPathError', { reason: 'already-registered' })
    },
  })
  renderPage()
  await screen.findByText('2 项')
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: '添加项目' })[0])
  })
  const dialog = await screen.findByRole('dialog', { name: '添加项目' })
  fireEvent.change(within(dialog).getByLabelText('项目目录'), { target: { value: '/w/demo/' } })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: '添加项目' }))
  })
  expect(within(dialog).getByRole('alert')).toHaveTextContent('这个目录已登记为项目「demo」')
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: '打开该项目' }))
  })
  expect(screen.getByTestId('project')).toHaveTextContent('p1')
})

test('a folder that does not exist is reported, and nothing is created', async () => {
  mockRpc({
    listProjects: () => [],
    addProject: () => {
      throw new rpcModule.RpcError('/w/nope does not exist; nothing was created', 'ProjectPathError', { reason: 'missing' })
    },
  })
  renderPage()
  await act(async () => {
    fireEvent.click((await screen.findAllByRole('button', { name: '添加项目' }))[0])
  })
  const dialog = await screen.findByRole('dialog', { name: '添加项目' })
  fireEvent.change(within(dialog).getByLabelText('项目目录'), { target: { value: '/w/nope' } })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: '添加项目' }))
  })
  expect(within(dialog).getByRole('alert')).toHaveTextContent('这个目录不存在，没有登记，也没有创建任何内容')
})

test('重新定位 points the project at its new folder', async () => {
  const calls = mockRpc({ relocateProject: () => ({ ...demo, path: '/w/moved' }) })
  renderPage()
  await screen.findByText('2 项')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'open-relocate' }))
  })
  const dialog = await screen.findByRole('dialog', { name: '重新定位 demo' })
  const input = within(dialog).getByLabelText('项目目录')
  expect(input).toHaveValue('/w/demo')
  fireEvent.change(input, { target: { value: '/w/moved' } })
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: '使用这个目录' }))
  })
  expect(calls.filter((c) => c.method === 'relocateProject')).toEqual([{ method: 'relocateProject', args: ['p1', '/w/moved'] }])
})
