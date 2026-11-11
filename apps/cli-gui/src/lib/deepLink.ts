/**
 * Registers a handler for deep links that arrive while the app is running.
 * Safe outside Tauri (dynamic import + catch) so it no-ops in tests/dev browser.
 * Returns an unlisten function.
 */
export async function onDeepLink(handler: (url: string) => void): Promise<() => void> {
  try {
    const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link')
    return await onOpenUrl((urls) => {
      for (const url of urls) handler(url)
    })
  } catch {
    return () => {}
  }
}

/**
 * The link that launched the app, if any. It is delivered before the webview has
 * a listener, so `onDeepLink` never sees it.
 */
export async function getLaunchDeepLinks(): Promise<string[]> {
  try {
    const { getCurrent } = await import('@tauri-apps/plugin-deep-link')
    return (await getCurrent()) ?? []
  } catch {
    return []
  }
}
