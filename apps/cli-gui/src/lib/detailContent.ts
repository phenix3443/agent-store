import type { SelectedDetail } from './useSelectedDetail'

export type Category = 'provider' | 'skill' | 'mcp'

export const TYPE_META: Record<Category, { label: string; textClass: string; bgClass: string }> = {
  provider: { label: '供应商', textClass: 'text-store-provider', bgClass: 'bg-store-provider-soft' },
  skill: { label: '技能', textClass: 'text-store-green', bgClass: 'bg-store-green-soft' },
  mcp: { label: 'MCP', textClass: 'text-store-amber', bgClass: 'bg-store-amber-soft' },
}

export const TIER_META: Record<string, { label: string; textClass: string; bgClass: string }> = {
  official: { label: '官方', textClass: 'text-store-amber', bgClass: 'bg-store-amber-soft' },
  verified: { label: '已验证', textClass: 'text-store-provider', bgClass: 'bg-store-provider-soft' },
  community: { label: '社区', textClass: 'text-store-text-2', bgClass: 'bg-store-panel-2' },
}

export const STATUS_META: Record<string, { label: string; textClass: string; borderClass: string }> = {
  published: { label: '已发布', textClass: 'text-store-green', borderClass: 'border-store-green' },
  pending: { label: '审核中', textClass: 'text-store-amber', borderClass: 'border-store-amber' },
  rejected: { label: '已拒绝', textClass: 'text-store-red', borderClass: 'border-store-red' },
}

export function statusOf(detail: SelectedDetail): 'published' | 'pending' | 'rejected' {
  return 'status' in detail && detail.status ? detail.status : 'published'
}

export type ReadmeBlock =
  | { type: 'h'; text: string }
  | { type: 'p'; text: string }
  | { type: 'code'; text: string }
  | { type: 'li'; text: string }

const USE_CASE_COPY: Record<Category, string> = {
  provider: '安装后作为可切换的 API 端点预设，一键切换即可对全部会话生效。',
  skill: '安装后 agent 会在相关任务中自动加载该技能，无需额外配置。',
  mcp: '安装后自动注册为 MCP 服务器，agent 可直接调用其暴露的工具。',
}

function formatStep(step: { type: string; command?: string; dest?: string }): string {
  if (step.type === 'script') return `script · ${step.command}`
  if (step.type === 'config') return 'config · 写入配置'
  return `file · ${step.dest}`
}

function defaultSteps(detail: SelectedDetail): string[] {
  if (detail.category === 'skill') {
    return [`file · 下载 skill 内容到 ~/.agents/skills/${detail.slug}`, 'config · 注册到已启用的工具目录']
  }
  if (detail.category === 'mcp') {
    const transport = 'transport' in detail && detail.transport ? detail.transport : 'stdio'
    return transport === 'stdio'
      ? ['script · 拉取并构建服务器二进制', `config · 写入 mcpServers.${detail.slug}（stdio）`]
      : [`config · 写入 mcpServers.${detail.slug}（${transport} 远程端点）`]
  }
  return ['config · 写入端点预设（baseUrl / apiKey / model）', 'script · 同步到 Claude 与 Codex 配置']
}

function typeFacts(detail: SelectedDetail): string[] {
  if (detail.category === 'provider') {
    const models = 'supportedModels' in detail ? detail.supportedModels : undefined
    if (models && models.length > 0) return [`支持的模型：${models.join('、')}`]
  }
  if (detail.category === 'mcp') {
    const transport = 'transport' in detail ? detail.transport : undefined
    if (transport) {
      const serverCommand = 'serverCommand' in detail ? detail.serverCommand : undefined
      const url = 'url' in detail ? detail.url : undefined
      return [
        `传输方式：${transport}`,
        transport === 'stdio' ? `启动命令：${serverCommand ?? '—'}` : `服务地址：${url ?? '—'}`,
      ]
    }
  }
  if (detail.category === 'skill') {
    const contentUrl = 'contentUrl' in detail ? detail.contentUrl : undefined
    if (contentUrl) return [`下载地址：${contentUrl}`]
  }
  return []
}

export function installCmdOf(slug: string): string {
  return `agent-store add ${slug}`
}

/** Ported from the mockup's `genReadme` — builds the 概览 tab content in the exact
 * section order: 概述 → 安装 → 安装步骤 → 适用场景 → type-specific facts → footer lines. */
export function buildReadme(detail: SelectedDetail, description: string): ReadmeBlock[] {
  const steps = 'installHook' in detail && detail.installHook.steps.length > 0
    ? detail.installHook.steps.map(formatStep)
    : defaultSteps(detail)
  const tier = detail.publisher.tier
  const blocks: ReadmeBlock[] = [
    { type: 'h', text: '概述' },
    { type: 'p', text: description },
    { type: 'h', text: '安装' },
    { type: 'code', text: installCmdOf(detail.slug) },
    { type: 'h', text: '安装步骤' },
    ...steps.map((s) => ({ type: 'li' as const, text: s })),
    { type: 'h', text: '适用场景' },
    { type: 'p', text: USE_CASE_COPY[detail.category] },
    ...typeFacts(detail).map((t) => ({ type: 'li' as const, text: t })),
    { type: 'li', text: `类型：${TYPE_META[detail.category].label}（${detail.category}）` },
    { type: 'li', text: `维护者：${detail.publisher.name} · ${TIER_META[tier]?.label ?? TIER_META.community.label}` },
    { type: 'li', text: `当前版本：v${detail.version}` },
  ]
  return blocks
}
