/** The system folder picker (tauri-plugin-dialog); null when the user cancels. */
export async function pickFolder(defaultPath?: string): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked = await open({ directory: true, multiple: false, ...(defaultPath ? { defaultPath } : {}) })
  return typeof picked === 'string' ? picked : null
}

export function looksAbsolute(path: string): boolean {
  return /^(~(\/|$)|\/|[A-Za-z]:[\\/]|\\\\)/.test(path)
}

// The engine resolves paths with Node's path.resolve, which does not expand `~`.
export async function expandHome(path: string): Promise<string> {
  if (path !== '~' && !path.startsWith('~/')) return path
  const { homeDir } = await import('@tauri-apps/api/path')
  return (await homeDir()).replace(/[\\/]+$/, '') + path.slice(1)
}
