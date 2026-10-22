// Which tool entries Agent Store wrote for an MCP item, and what it replaced:
// ~/.agents/mcps/<slug>/targets.json (docs/global-skills-mcp.md §5.5).
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { ToolTarget } from '@as/types'
import { atomicWriteFile } from './safe-file'

export interface McpTargetRecord {
  /** Entry name in the tool config. */
  name: string
  /** The entry as read back right after our write; null while a write is in flight. */
  written: unknown | null
  /** The user's entry we took over with --replace, restored on disable/uninstall. */
  previous: unknown | null
  /** CLI version used for the takeover's trial round-trip. */
  cliVersion?: string
}

export type McpTargets = Partial<Record<ToolTarget, McpTargetRecord>>

const file = (itemDir: string) => join(itemDir, 'targets.json')

export async function readMcpTargets(itemDir: string): Promise<McpTargets> {
  try {
    return JSON.parse(await readFile(file(itemDir), 'utf-8')) as McpTargets
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw new Error(`Cannot read ${file(itemDir)}: ${(e as Error).message}`)
  }
}

export async function writeMcpTargets(itemDir: string, targets: McpTargets): Promise<void> {
  await atomicWriteFile(file(itemDir), JSON.stringify(targets, null, 2) + '\n', 0o600)
}
