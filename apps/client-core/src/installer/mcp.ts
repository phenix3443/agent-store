import { access, chmod } from 'fs/promises'
import { join } from 'path'

export async function postInstall(itemDir: string): Promise<void> {
  const serverPath = join(itemDir, 'server')
  try {
    await access(serverPath)
    await chmod(serverPath, 0o755)
  } catch {
    // server file may not exist for all MCP items (e.g. SSE/HTTP transport)
  }
}
