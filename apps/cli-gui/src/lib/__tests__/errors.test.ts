import { test, expect } from 'bun:test'
import { describeError } from '../errors'
import { RpcError } from '../rpc'
import { messages } from '../../i18n/messages'

function tFor(locale: 'zh' | 'en') {
  return (key: string) => key.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], messages[locale]) as string
}
const zh = tFor('zh')
const en = tFor('en')
const err = (code: string, fields = {}) => new RpcError(`raw ${code} text; run: aas something --force`, code, fields)

test('known engine errors become in-app instructions, keeping the engine text as detail', () => {
  const cases: Array<[RpcError, string, string]> = [
    [err('ProviderNotReadyError', { reason: 'no-key' }), '请先填写 API 密钥', 'Enter an API key first'],
    [err('ProviderNotReadyError', { reason: 'relay-not-running' }), '本地中转服务没有启动起来', "local relay couldn't be started"],
    [err('IncompatibleTargetError', { target: 'codex' }), '这个资源不支持 Codex', "doesn't support Codex"],
    [err('McpConfigMissingError'), '请先填写带 * 的必填配置', 'Fill in the required fields'],
    [err('McpChangedOutsideError', { tool: 'claude' }), 'Claude Code 里的这条配置在 Agent Store 之外被改动过', 'This entry in Claude Code was changed outside'],
    [err('McpConflictError', { tool: 'codex' }), 'Codex 里已经有一条同名的 MCP 配置', 'Codex already has an MCP server'],
    [err('McpNotRestorableError', { tool: 'claude', reason: 'no-cli' }), '没有找到 Claude Code 的命令行', "Claude Code's CLI wasn't found"],
    [err('McpNotRestorableError', { tool: 'codex', reason: 'inexact' }), 'Codex 的命令行不能把原条目原样写回', "Codex's CLI can't write the original entry back exactly"],
    [err('SkillDeployRefusedError', { reason: 'not-managed', tool: 'codex' }), 'Codex 的技能目录里已经有同名的内容', "Codex's skills folder already has"],
    [err('SkillDeployRefusedError', { reason: 'record-mismatch', tool: 'claude' }), 'Claude Code 里这个技能的位置已被别的内容占用', 'Something else now sits where this skill was deployed in Claude Code'],
    [err('SkillConflictError', { reason: 'name-clash' }), 'Codex 已经能看到另一个同名的技能', 'Codex already sees another skill'],
    [err('CodexMcpUnsupportedError', { reason: 'sse', tool: 'codex' }), 'Codex 不支持 SSE', "Codex doesn't support MCP servers over SSE"],
    [err('CodexMcpUnsupportedError', { reason: 'headers', tool: 'codex' }), 'Bearer 令牌以外的请求头', 'other than a bearer token'],
    [err('AmbiguousResourceError', { reason: 'ambiguous' }), '目录里有多个同名的资源', 'several resources with this name'],
    [err('ResourceNotFoundError', { reason: 'not-found' }), '目录里没有这个资源', "doesn't have this resource"],
    [err('CatalogUnavailableError', { reason: 'unavailable' }), '目录暂时取不到', "couldn't be reached"],
    [err('McpNotInstallableError', { reason: 'no-launcher' }), '没有 Agent Store 能运行的安装方式', 'no install method Agent Store can run'],
  ]
  for (const [e, zhText, enText] of cases) {
    const z = describeError(e, zh)
    expect(z.message).toContain(zhText)
    expect(z.message).not.toContain('aas ')
    expect(z.detail).toBe(e.message)
    expect(describeError(e, en).message).toContain(enText)
  }
})

test('a missing key points at the key field', () => {
  expect(describeError(err('ProviderNotReadyError', { reason: 'no-key' }), zh).focus).toBe('apiKey')
})

test('an entry changed outside reads differently when uninstalling', () => {
  const m = describeError(err('McpChangedOutsideError', { tool: 'codex' }), zh, 'uninstall').message
  expect(m).toContain('普通卸载不会删除它')
})

test('unknown errors show the original text and no detail', () => {
  expect(describeError(new RpcError('disk full', 'Error'), zh)).toEqual({ message: 'disk full' })
  expect(describeError(new Error('boom'), zh)).toEqual({ message: 'boom' })
})

test('project errors say why and what to do next', () => {
  const cases: Array<[RpcError, 'action' | 'uninstall', string, string]> = [
    [err('ProjectConflictError', { reason: 'not-ours', tool: 'codex' }), 'action', 'Codex 在这个项目里已有同名的条目，不是 Agent Store 写的', "Codex already has an entry with this name"],
    [err('ProjectConflictError', { reason: 'modified', tool: 'claude' }), 'action', '「仍然替换」', 'Replace anyway'],
    [err('ProjectConflictError', { reason: 'modified', tool: 'claude' }), 'uninstall', '「仍然卸载」', 'Uninstall anyway'],
    [err('ProjectConflictError', { reason: 'not-ours', tool: 'claude' }), 'uninstall', '已不是 Agent Store 安装的副本', 'no longer the one Agent Store installed'],
    [err('ProjectConflictError', { reason: 'name-clash', tool: 'codex' }), 'action', '只为 Claude Code 安装', 'for Claude Code only'],
    [err('ProjectPathError', { reason: 'missing' }), 'action', '这个目录不存在', "doesn't exist"],
    [err('ProjectPathError', { reason: 'not-a-directory' }), 'action', '不是目录', "isn't a folder"],
    [err('ProjectPathError', { reason: 'already-registered' }), 'action', '已经登记为项目', 'already registered'],
    [err('ProjectNotFoundError', { reason: 'project-not-found' }), 'action', '已不在项目列表里', 'no longer in the project list'],
    [err('ProjectItemNotInstalledError', { reason: 'not-installed' }), 'uninstall', '只能在项目里手动删除', 'by hand'],
    [err('ProjectMcpUnsupportedError', { reason: 'not-portable' }), 'action', '只能全局安装', 'only be installed globally'],
    [err('ProjectMcpUnsupportedError', { reason: 'codex-reference', tool: 'codex' }), 'action', '只能为 Claude Code 装进项目', 'for Claude Code only'],
    [err('ProjectMcpUnsupportedError', { reason: 'sse', tool: 'codex' }), 'action', 'Codex 不支持 SSE', "doesn't support SSE"],
    [err('Error', { reason: 'project-missing' }), 'action', '先重新定位项目', 'Locate the project first'],
    [err('Error', { reason: 'unsupported' }), 'action', '供应商只能全局安装', 'Providers are global only'],
  ]
  for (const [e, context, zhText, enText] of cases) {
    const z = describeError(e, zh, context)
    expect(z.message).toContain(zhText)
    expect(z.message).not.toContain('--force')
    expect(z.detail).toBe(e.message)
    expect(describeError(e, en, context).message).toContain(enText)
  }
})

test('every {tool} in a message is filled in', () => {
  const m = describeError(err('McpNotRestorableError', { tool: 'claude', reason: 'no-cli' }), zh).message
  expect(m).not.toContain('{tool}')
  expect(m.split('Claude Code').length - 1).toBe(3)
})
