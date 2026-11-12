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
