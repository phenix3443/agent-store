import type { TFn } from '../i18n'
import { RpcError, errorText } from './rpc'

/** What the desktop user reads: what to do in the app, with the engine's own text kept as detail. */
export interface FriendlyError {
  message: string
  /** The engine message, shown behind 详细信息; absent when it is already the message. */
  detail?: string
  /** A field on the current page that fixes it. */
  focus?: 'apiKey'
}

const TOOL_LABEL: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' }

export function describeError(err: unknown, t: TFn, context: 'action' | 'uninstall' = 'action'): FriendlyError {
  const raw = errorText(err)
  if (!(err instanceof RpcError)) return { message: raw }
  const { reason, tool, target } = err.fields
  const toolLabel = TOOL_LABEL[tool ?? target ?? ''] ?? t('errors.theClient')
  const known = (key: string, extra: Partial<FriendlyError> = {}): FriendlyError => ({
    message: t(`errors.${key}`).replace('{tool}', toolLabel),
    detail: raw,
    ...extra,
  })
  switch (err.code) {
    case 'ProviderNotReadyError':
      if (reason === 'no-key') return known('noKey', { focus: 'apiKey' })
      if (reason === 'relay-not-running') return known('relayDown')
      break
    case 'IncompatibleTargetError':
      return known('incompatible')
    case 'McpConfigMissingError':
      return known('mcpNeedsConfig')
    case 'McpChangedOutsideError':
      return known(context === 'uninstall' ? 'changedOutsideUninstall' : 'changedOutside')
    case 'McpConflictError':
      return known('conflict')
    case 'SkillConflictError':
      return known(context === 'uninstall' ? 'skillChangedUninstall' : 'skillChanged')
  }
  return { message: raw }
}
