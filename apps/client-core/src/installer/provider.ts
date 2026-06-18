import { access, writeFile } from 'fs/promises'
import { join } from 'path'

export async function postInstall(itemDir: string): Promise<void> {
  const configPath = join(itemDir, 'config.json')
  try {
    await access(configPath)
  } catch {
    await writeFile(configPath, '{}')
  }
}
