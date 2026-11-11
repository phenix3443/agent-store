import { access } from 'fs/promises'
import { join } from 'path'
import { atomicWriteSecretFile } from '../config/safe-file'

export async function postInstall(itemDir: string): Promise<void> {
  const configPath = join(itemDir, 'config.json')
  try {
    await access(configPath)
  } catch {
    await atomicWriteSecretFile(configPath, '{}')
  }
}
