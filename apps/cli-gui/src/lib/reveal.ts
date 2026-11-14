/** Shows a file or folder selected in the system file manager (tauri-plugin-opener). */
export async function revealPath(path: string): Promise<void> {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  await revealItemInDir(path)
}
