import type { SelectedDetail } from './useSelectedDetail'
import { formatVersion } from './catalog'
import type { TFn } from '../i18n'

export type Category = 'provider' | 'skill' | 'mcp'

export const TYPE_META: Record<Category, { textClass: string; bgClass: string }> = {
  provider: { textClass: 'text-store-provider', bgClass: 'bg-store-provider-soft' },
  skill: { textClass: 'text-store-green', bgClass: 'bg-store-green-soft' },
  mcp: { textClass: 'text-store-amber', bgClass: 'bg-store-amber-soft' },
}

export const TIER_META: Record<string, { textClass: string; bgClass: string }> = {
  official: { textClass: 'text-store-amber', bgClass: 'bg-store-amber-soft' },
  verified: { textClass: 'text-store-provider', bgClass: 'bg-store-provider-soft' },
  community: { textClass: 'text-store-text-2', bgClass: 'bg-store-panel-2' },
}

export type ReadmeBlock =
  | { type: 'h'; text: string }
  | { type: 'p'; text: string }
  | { type: 'code'; text: string }
  | { type: 'li'; text: string }

function useCaseCopy(category: Category, t: TFn): string {
  if (category === 'skill') return t('readme.useCaseSkill')
  if (category === 'mcp') return t('readme.useCaseMcp')
  return t('readme.useCaseProvider')
}

function formatStep(step: { type: string; command?: string; dest?: string }, t: TFn): string {
  if (step.type === 'script') return `script · ${step.command}`
  if (step.type === 'config') return `config · ${t('readme.writeConfig')}`
  return `file · ${step.dest}`
}

function requiredKeys(detail: SelectedDetail): string[] {
  const schema = ('configSchema' in detail ? detail.configSchema : undefined) as { required?: string[] } | undefined
  return schema?.required ?? []
}

function defaultSteps(detail: SelectedDetail, t: TFn): string[] {
  if (detail.category === 'skill') {
    return [`file · ${t('catalog.skillFetch')} ~/.agent-store/skills/${detail.slug}`, `link · ${t('catalog.skillLink')}`]
  }
  if (detail.category === 'mcp') {
    const transport = 'transport' in detail && detail.transport ? detail.transport : 'stdio'
    const needs = requiredKeys(detail)
    const needsLine = needs.length ? [`config · ${t('catalog.mcpNeeds')} ${needs.join(', ')}`] : []
    if (transport === 'stdio') {
      const command = 'serverCommand' in detail ? detail.serverCommand : undefined
      return [
        ...(command ? [`run · ${t('catalog.mcpRun')} ${command}`] : []),
        ...needsLine,
        `config · ${t('readme.writeMcp')} mcpServers.${detail.slug}（stdio）`,
      ]
    }
    const url = 'url' in detail ? detail.url : undefined
    return [
      ...(url ? [`connect · ${t('catalog.mcpConnect')} ${url}`] : []),
      ...needsLine,
      `config · ${t('readme.writeMcp')} mcpServers.${detail.slug}（${transport} ${t('readme.remoteEndpoint')}）`,
    ]
  }
  return [
    `config · ${t('catalog.providerPreset')} ~/.agent-store/providers/${detail.slug}/config.json`,
    `config · ${t('readme.syncToCli')}`,
  ]
}

export function typeFacts(detail: SelectedDetail, t: TFn): string[] {
  if (detail.category === 'provider') {
    const models = 'supportedModels' in detail ? detail.supportedModels : undefined
    if (models && models.length > 0) return [`${t('readme.factModels')}${models.join('、')}`]
  }
  if (detail.category === 'mcp') {
    const transport = 'transport' in detail ? detail.transport : undefined
    if (transport) {
      const serverCommand = 'serverCommand' in detail ? detail.serverCommand : undefined
      const url = 'url' in detail ? detail.url : undefined
      return [
        `${t('readme.factTransport')}${transport}`,
        transport === 'stdio'
          ? `${t('readme.factStartCommand')}${serverCommand ?? '—'}`
          : `${t('readme.factServiceUrl')}${url ?? '—'}`,
      ]
    }
  }
  if (detail.category === 'skill') {
    const repo = detail.resource?.kind === 'skill' ? detail.resource.repo : undefined
    if (repo) return [`${t('catalog.factSource')}${repo.fullName}${repo.dir ? `/${repo.dir}` : ''} @ ${repo.commit.slice(0, 12)}`]
    const contentUrl = 'contentUrl' in detail ? detail.contentUrl : undefined
    if (contentUrl) return [`${t('readme.factDownloadUrl')}${contentUrl}`]
  }
  return []
}

/** What installing this package runs and writes, one line per step. */
export function installStepsOf(detail: SelectedDetail, t: TFn): string[] {
  return 'installHook' in detail && detail.installHook.steps.length > 0
    ? detail.installHook.steps.map((s) => formatStep(s, t))
    : defaultSteps(detail, t)
}

/** `aas install <catalog id>` when the item has one, else its slug. */
export function installCmdOf(ref: string): string {
  return `aas install ${ref}`
}

export function installRefOf(detail: Pick<SelectedDetail, 'slug' | 'resourceId'>): string {
  return detail.resourceId ?? detail.slug
}

/** Builds the overview tab content in section order:
 * overview → install → install steps → use cases → type-specific facts → footer lines. */
export function buildReadme(detail: SelectedDetail, description: string, t: TFn): ReadmeBlock[] {
  const steps = installStepsOf(detail, t)
  const tier = detail.publisher.tier
  const tierLabel = TIER_META[tier] ? t(`tier.${tier}`) : t('tier.community')
  const blocks: ReadmeBlock[] = [
    { type: 'h', text: t('readme.overview') },
    { type: 'p', text: description },
    { type: 'h', text: t('readme.install') },
    { type: 'code', text: installCmdOf(installRefOf(detail)) },
    { type: 'h', text: t('readme.steps') },
    ...steps.map((s) => ({ type: 'li' as const, text: s })),
    { type: 'h', text: t('readme.useCases') },
    { type: 'p', text: useCaseCopy(detail.category, t) },
    ...typeFacts(detail, t).map((fact) => ({ type: 'li' as const, text: fact })),
    { type: 'li', text: `${t('readme.footType')}${t(`categories.${detail.category}`)}（${detail.category}）` },
    { type: 'li', text: `${t('readme.footMaintainer')}${detail.publisher.name} · ${tierLabel}` },
    ...(detail.version ? [{ type: 'li' as const, text: `${t('readme.footVersion')}${formatVersion(detail.version)}` }] : []),
  ]
  return blocks
}
