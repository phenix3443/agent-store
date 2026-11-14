import { test, expect } from 'bun:test'
import type { Engine, ProjectDetail, ProjectInstallResult } from '@as/types'
import { runProjects, type ProjectsIo } from '../projects'
import { runInstall } from '../install'
import { runUninstall } from '../uninstall'
import { runRpc } from '../rpc'

const detail: ProjectDetail = {
  id: 'p1', path: '/work/repo', name: 'repo', addedAt: '', exists: true, codexTrusted: false,
  skills: [{ kind: 'skill', name: 'review', slug: 'review', version: '1', managed: true, agents: ['claude', 'codex'], locations: [] }],
  mcps: [{
    kind: 'mcp', name: 'keyed', slug: 'keyed', managed: true, agents: [], overridesUser: true, missingEnv: ['API_KEY'],
    locations: [{ agent: 'claude', scope: 'project', file: '/work/repo/.mcp.json', managed: true, modified: false, active: false, approval: 'pending', overridesUser: true, env: ['API_KEY'], missingEnv: ['API_KEY'] }],
  }],
  env: [{ name: 'API_KEY', stored: false, usedBy: ['keyed'] }],
}

function io(overrides: Partial<ProjectsIo> = {}): ProjectsIo & { lines: string[] } {
  const lines: string[] = []
  return { lines, out: s => lines.push(s), readSecret: async () => 'sk-1', exec: async () => 0, ...overrides }
}

const engine = (overrides: Partial<Engine>) => overrides as unknown as Engine

test('show lists skills and MCP servers with who installed them and what is missing', async () => {
  const o = io()
  expect(await runProjects(engine({ getProject: async () => detail }), ['show', '.'], o)).toBe(0)
  const text = o.lines.join('\n')
  expect(text).toContain('review')
  expect(text).toContain('Agent Store (keyed)')
  expect(text).toContain('overrides user entry; missing API_KEY; Claude Code approval pending')
  expect(text).toContain('aas projects set-env p1 API_KEY')
})

test('add passes --name; a missing directory error exits 1', async () => {
  let got: unknown[] = []
  const e = engine({ addProject: async (...a: unknown[]) => { got = a; return { id: 'p1', path: '/w', name: 'w', addedAt: '', exists: true } } })
  expect(await runProjects(e, ['add', '/w', '--name', 'Web'], io())).toBe(0)
  expect(got).toEqual(['/w', { name: 'Web' }])
  const failing = engine({ addProject: async () => { throw new Error('/nope does not exist; nothing was created') } })
  const o = io()
  expect(await runProjects(failing, ['add', '/nope'], o)).toBe(1)
  expect(o.lines.join('\n')).toContain('does not exist')
})

test('set-env reads the value from stdin, never from argv', async () => {
  let stored: unknown[] = []
  const e = engine({ setProjectEnv: async (...a: unknown[]) => { stored = a } })
  expect(await runProjects(e, ['set-env', 'p1', 'API_KEY', 'inline-secret'], io())).toBe(2)
  expect(await runProjects(e, ['set-env', 'p1', 'API_KEY'], io())).toBe(0)
  expect(stored).toEqual(['p1', 'API_KEY', 'sk-1'])
})

test('env prints shell-quoted export lines', async () => {
  const o = io()
  await runProjects(engine({ getProjectEnvValues: async () => ({ A: "it's" }) }), ['env', 'p1'], o)
  expect(o.lines).toEqual([`export A='it'\\''s'`])
})

test('exec runs the command in the project directory with the stored values over the shell environment', async () => {
  process.env['API_KEY'] = 'from-shell'
  let call: { cmd: string[]; cwd: string; env: NodeJS.ProcessEnv } | undefined
  const o = io({ exec: async (cmd, cwd, env) => { call = { cmd, cwd, env }; return 7 } })
  const e = engine({ getProject: async () => detail, getProjectEnvValues: async () => ({ API_KEY: 'stored' }) })
  expect(await runProjects(e, ['exec', '.', '--', 'claude', '-p', 'hi'], o)).toBe(7)
  expect(call?.cmd).toEqual(['claude', '-p', 'hi'])
  expect(call?.cwd).toBe('/work/repo')
  expect(call?.env['API_KEY']).toBe('stored')
  delete process.env['API_KEY']
  expect(await runProjects(e, ['exec', '.'], io())).toBe(2)
})

test('install --project goes to the project and says what to do about keys', async () => {
  let got: unknown[] = []
  const result: ProjectInstallResult = {
    projectId: 'p1', slug: 'keyed', kind: 'mcp', version: '1', name: 'keyed', env: ['API_KEY'], codexTrusted: false,
    installed: [{ agent: 'claude', file: '/w/.mcp.json' }, { agent: 'codex', file: '/w/.codex/config.toml' }], skipped: [],
  }
  const e = engine({ installToProject: async (...a: unknown[]) => { got = a; return result }, installAndEnable: async () => { throw new Error('user install') } })
  const lines: string[] = []
  expect(await runInstall(e, ['keyed', '--project', '.', '--target', 'codex'], s => lines.push(s))).toBe(0)
  expect(got).toEqual(['.', 'keyed', { targets: ['codex'] }])
  const text = lines.join('\n')
  expect(text).toContain('aas projects set-env p1 <NAME>')
  expect(text).toContain('Codex ignores .codex/config.toml')
  expect(await runInstall(e, ['keyed', '--project'], () => {})).toBe(2)
})

test('uninstall --project removes from the project only', async () => {
  let got: unknown[] = []
  const e = engine({
    uninstallFromProject: async (...a: unknown[]) => { got = a; return { removed: [{ agent: 'claude', file: '/w/.mcp.json' }] } },
    uninstall: async () => { throw new Error('user uninstall') },
  })
  const lines: string[] = []
  expect(await runUninstall(e, ['keyed', '--project', 'p1', '--target', 'claude', '--force'], s => lines.push(s))).toBe(0)
  expect(got).toEqual(['p1', 'keyed', { targets: ['claude'], force: true }])
  expect(await runUninstall(e, ['keyed', '--target', 'claude'], () => {})).toBe(2)
})

test('project methods are reachable over __rpc with the usual { ok, data } envelope', async () => {
  const lines: string[] = []
  const e = engine({ getProject: async (ref: string) => ({ ...detail, id: ref }) })
  expect(await runRpc(e, ['getProject', '["p9"]'], s => lines.push(s))).toBe(0)
  expect(JSON.parse(lines[0])).toMatchObject({ ok: true, data: { id: 'p9' } })
  const err = Object.assign(new Error('conflict'), { name: 'ProjectConflictError', reason: 'not-ours', tool: 'codex' })
  lines.length = 0
  await runRpc(engine({ installToProject: async () => { throw err } }), ['installToProject', '["p1","x"]'], s => lines.push(s))
  expect(JSON.parse(lines[0])).toEqual({ ok: false, error: 'conflict', code: 'ProjectConflictError', reason: 'not-ours', tool: 'codex' })
})
