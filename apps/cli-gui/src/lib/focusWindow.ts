/** Brings the main window to the front. No-ops outside Tauri. */
export async function focusMainWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    for (const step of [() => win.unminimize(), () => win.show(), () => win.setFocus()]) {
      try {
        await step()
      } catch {
        /* one refused step must not stop the rest */
      }
    }
  } catch {
    /* not running in Tauri */
  }
}
