import type { SelectedDetail } from './useSelectedDetail'

export type Category = 'provider' | 'skill' | 'mcp'

export const TYPE_META: Record<Category, { label: string; textClass: string; bgClass: string; metaLabel: string }> = {
  provider: { label: '供应商', textClass: 'text-store-provider', bgClass: 'bg-store-provider-soft', metaLabel: '延迟' },
  skill: { label: '技能', textClass: 'text-store-green', bgClass: 'bg-store-green-soft', metaLabel: '大小' },
  mcp: { label: 'MCP', textClass: 'text-store-amber', bgClass: 'bg-store-amber-soft', metaLabel: '工具' },
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

/** Deterministic hash of a string — mirrors the mockup's char-code-sum seed used to
 * pick stable-but-varied placeholder content per item, without a real backend source. */
function seedOf(text: string): number {
  return Math.abs([...text].reduce((sum, ch) => sum + ch.charCodeAt(0), 0))
}

export function statusOf(detail: SelectedDetail): 'published' | 'pending' | 'rejected' {
  return 'status' in detail && detail.status ? detail.status : 'published'
}

/** Real `rating` is only present on catalog (not-yet-installed) items and is `0` until the
 * rating system ships. Fall back to a stable placeholder (mirrors the mockup's static demo
 * ratings) so the UI doesn't show a broken "★ 0" for every item. */
export function ratingOf(detail: SelectedDetail): number {
  const real = 'rating' in detail ? detail.rating : undefined
  if (real) return real
  return 4.3 + (seedOf(detail.slug) % 6) / 10
}

/** No backend field for review counts exists yet — derive a stable placeholder count,
 * same spirit as the mockup's per-item static `reviews` field. */
export function reviewCountOf(detail: SelectedDetail): number {
  return 80 + (seedOf(detail.slug) % 4000)
}

export function starGlyphs(rating: number): string {
  const n = Math.round(rating)
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n)
}

const REVIEW_POOL = [
  { u: 'lin_dev', r: 5, t: '集成顺滑，文档清晰，装上就能用。', d: '2天前' },
  { u: 'kaito', r: 5, t: '比自己手写配置省事太多，强烈推荐。', d: '1周前' },
  { u: 'm_zhao', r: 4, t: '整体不错，偶尔需要手动重连一次。', d: '2周前' },
  { u: 'devon', r: 5, t: '更新很勤，维护者响应 issue 很快。', d: '3周前' },
  { u: 'sara_k', r: 4, t: '功能齐全，希望能补充更多示例。', d: '1月前' },
  { u: 'oss_fan', r: 5, t: '开箱即用，和 Claude Code 配合完美。', d: '1月前' },
  { u: 'quill', r: 3, t: '能用，但大项目下稍慢，期待优化。', d: '2月前' },
  { u: 'nova', r: 5, t: '团队已全面切换到它来管理，稳定。', d: '2月前' },
]

const AVATAR_COLORS = ['#7c82ff', '#3ad29f', '#f0b34a', '#58a6f0', '#c07cf0', '#f3675f']

export interface GeneratedReview {
  u: string
  stars: string
  t: string
  d: string
  initial: string
  avatarBg: string
}

/** Placeholder reviews — the mockup itself has no real review backend, it deterministically
 * samples a fixed review pool keyed by item id. Ported 1:1, keyed by the real slug. */
export function reviewsFor(slug: string): GeneratedReview[] {
  const start = seedOf(slug) % REVIEW_POOL.length
  return Array.from({ length: 3 }, (_, i) => {
    const r = REVIEW_POOL[(start + i) % REVIEW_POOL.length]
    return {
      u: r.u,
      stars: '★'.repeat(r.r),
      t: r.t,
      d: r.d,
      initial: r.u[0].toUpperCase(),
      avatarBg: AVATAR_COLORS[(start + i) % AVATAR_COLORS.length],
    }
  })
}

export interface GeneratedVersion {
  ver: string
  note: string
  date: string
  latest: boolean
}

/** Ported from the mockup's `genVersions` — synthesizes 2 older versions below the real
 * current version by decrementing the semver, since there is no version-history backend yet. */
export function genVersions(version: string): GeneratedVersion[] {
  const notes = ['当前最新版本', '稳定性与性能优化', '修复若干问题']
  const dates = ['最近更新', '1 个月前', '3 个月前']
  const parts = version.split('.').map(Number)
  const out: GeneratedVersion[] = [{ ver: 'v' + version, note: notes[0], date: dates[0], latest: true }]
  let [a, b, c] = parts
  for (let i = 1; i < 3; i++) {
    if (c > 0) c -= 1
    else if (b > 0) {
      b -= 1
      c = 2
    } else if (a > 0) {
      a -= 1
      b = 9
    }
    out.push({ ver: 'v' + [a, b, c].join('.'), note: notes[i], date: dates[i], latest: false })
  }
  return out
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
