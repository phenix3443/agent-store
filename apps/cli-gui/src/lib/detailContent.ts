import type { CatalogResourceDetail, Item, ItemDetail } from '@as/types'
import type { TFn } from '../i18n'

/** An installed entry as `info` returns it, or a catalog entry with its install preview. */
export type SelectedDetail =
  | (ItemDetail & { installed: true; resource?: undefined })
  | (Item & { installed: false; resource: CatalogResourceDetail })

export type Category = 'provider' | 'skill' | 'mcp'

function formatStep(step: { type: string; command?: string; dest?: string }, t: TFn): string {
  if (step.type === 'script') return `script · ${step.command}`
  if (step.type === 'config') return `config · ${t('readme.writeConfig')}`
  return `file · ${step.dest}`
}

export function requiredKeys(detail: SelectedDetail): string[] {
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
