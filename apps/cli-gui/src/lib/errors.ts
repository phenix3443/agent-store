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
    message: t(key.includes('.') ? key : `errors.${key}`).replace('{tool}', toolLabel),
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
      if (reason === 'name-clash') return known('nameClash')
      if (reason === 'not-ours') return known('skillNotOurs')
      return known(context === 'uninstall' ? 'skillChangedUninstall' : 'skillChanged')
    case 'SkillDeployRefusedError':
      return known(reason === 'record-mismatch' ? 'deployMismatch' : 'deployRefused')
    case 'CodexMcpUnsupportedError':
      return known(reason === 'sse' ? 'codexSse' : 'codexHeaders')
    case 'AmbiguousResourceError':
      return known('ambiguous')
    case 'ResourceNotFoundError':
      return known('resourceNotFound')
    case 'CatalogUnavailableError':
      return known('catalogDown')
    case 'McpNotInstallableError':
      return known('notInstallable')
    case 'ProjectConflictError':
      if (reason === 'name-clash') return known('pj.err.nameClash')
      if (reason === 'modified') return known(context === 'uninstall' ? 'pj.err.modifiedUn' : 'pj.err.modified')
      return known(context === 'uninstall' ? 'pj.err.notOursUn' : 'pj.err.notOurs')
    case 'ProjectPathError':
      if (reason === 'already-registered') return known('pj.err.already')
      return known(reason === 'not-a-directory' ? 'pj.err.notDir' : 'pj.err.pathMissing')
    case 'ProjectNotFoundError':
      return known('pj.err.notFound')
    case 'ProjectItemNotInstalledError':
      return known('pj.err.notInstalled')
    case 'ProjectMcpUnsupportedError':
      if (reason === 'not-portable') return known('pj.err.notPortable')
      if (reason === 'sse') return known('pj.err.sse')
      if (reason === 'codex-reference') return known('pj.err.codexRef')
      return known('pj.err.envName')
  }
  // Plain errors the project service tags with a reason only.
  if (reason === 'project-missing') return known('pj.err.projectMissing')
  if (reason === 'unsupported') return known('pj.err.unsupported')
  if (reason === 'incompatible') return known('incompatible')
  return { message: raw }
}
