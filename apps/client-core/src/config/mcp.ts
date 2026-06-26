import { resolve } from 'path'
import type { MCPItem } from '@aas/types'

export interface StdioMcpServerConfig {
  type: 'stdio'
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
}

export interface RemoteMcpServerConfig {
  type: 'http' | 'sse'
  url: string
  headers?: Record<string, string>
}

export type McpServerConfig = StdioMcpServerConfig | RemoteMcpServerConfig

function splitCommand(serverCommand: string): { command: string; args: string[] } {
  const parts = serverCommand.split(' ').filter(Boolean)
  return {
    command: parts[0] ?? '',
    args: parts.slice(1),
  }
}

function resolveIfRelative(value: string, baseDir: string): string {
  return value.startsWith('.') ? resolve(baseDir, value) : value
}

export function buildLegacyMcpServerConfig(
  manifest: MCPItem,
  itemDir: string
): McpServerConfig {
  switch (manifest.transport) {
    case 'http':
    case 'sse':
      if (!manifest.url) throw new Error(`Missing MCP url for ${manifest.slug}`)
      return {
        type: manifest.transport,
        url: manifest.url,
        ...(manifest.headers ? { headers: manifest.headers } : {}),
      }
    case 'stdio': {
      if (!manifest.serverCommand) throw new Error(`Missing MCP serverCommand for ${manifest.slug}`)
      const { command, args } = splitCommand(manifest.serverCommand)
      return {
        type: 'stdio',
        command: resolveIfRelative(command, itemDir),
        args,
      }
    }
  }
}

export function buildPackageStdioMcpServerConfig(input: {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  packageDir: string
}): StdioMcpServerConfig {
  return {
    type: 'stdio',
    command: resolveIfRelative(input.command, input.packageDir),
    args: input.args ?? [],
    ...(input.cwd ? { cwd: resolveIfRelative(input.cwd, input.packageDir) } : {}),
    ...(input.env && Object.keys(input.env).length > 0 ? { env: input.env } : {}),
  }
}
