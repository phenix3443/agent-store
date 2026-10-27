// Errors for MCP entry ownership (docs/global-skills-mcp.md §5.5). Each names
// the tool, the entry and what the user can do next.
import type { ToolTarget } from '@as/types'

const TOOL = { claude: 'Claude Code', codex: 'Codex' } as const

export class McpConflictError extends Error {
  constructor(readonly tool: ToolTarget, readonly entry: string) {
    super(`${TOOL[tool]} already has an MCP server named "${entry}" that Agent Store did not write; nothing was changed. Rename or remove it, or enable with --replace to take it over (it is restored on disable/uninstall).`)
    this.name = 'McpConflictError'
  }
}

export class McpChangedOutsideError extends Error {
  constructor(readonly tool: ToolTarget, readonly entry: string, readonly how: 'changed' | 'removed') {
    super(`The ${TOOL[tool]} MCP entry "${entry}" was ${how} outside Agent Store; nothing was changed. Use --force to ${how === 'removed' ? 'proceed anyway' : 'overwrite or remove it anyway'}.`)
    this.name = 'McpChangedOutsideError'
  }
}

export class McpNotRestorableError extends Error {
  constructor(readonly tool: ToolTarget, readonly entry: string, readonly keys: string[]) {
    super(`Cannot take over the ${TOOL[tool]} MCP entry "${entry}": the ${tool} CLI could not put it back exactly (not restorable: ${keys.join(', ')}). Nothing was changed; rename or remove that entry yourself, then enable again.`)
    this.name = 'McpNotRestorableError'
  }
}

export class McpRestoreMismatchError extends Error {
  constructor(readonly tool: ToolTarget, readonly entry: string, readonly previous: unknown, readonly keys: string[]) {
    super(`Restored ${TOOL[tool]} MCP entry "${entry}" differs from the saved one (keys: ${keys.join(', ')}). The saved entry is kept in targets.json: ${JSON.stringify(previous)}`)
    this.name = 'McpRestoreMismatchError'
  }
}
