import { STORE_ORIGINS } from '@as/client-core'

/**
 * The origins `aas __local-api [origin]` answers: the web store's, plus the store a
 * desktop build was pointed at (VITE_STORE_URL, e.g. a local dev store). Anything that
 * is not a plain http(s) origin is ignored.
 */
export function localApiOrigins(args: string[]): string[] {
  const extra = args[0]
  if (!extra) return [...STORE_ORIGINS]
  try {
    const url = new URL(extra)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin !== extra.replace(/\/$/, '')) return [...STORE_ORIGINS]
    return [...new Set([...STORE_ORIGINS, url.origin])]
  } catch {
    return [...STORE_ORIGINS]
  }
}

/** Serves until stdin closes: the desktop app holds its write end, so this exits with the app. */
export async function runLocalApi(
  args: string[],
  start: (origins: string[]) => { stop: () => void },
  stdin: NodeJS.ReadableStream = process.stdin,
): Promise<void> {
  let server: { stop: () => void }
  try {
    server = start(localApiOrigins(args))
  } catch (err) {
    // Usually the port is taken, e.g. by another running copy; the store then shows nothing extra.
    console.error(`[local-api] not started: ${err instanceof Error ? err.message : String(err)}`)
    return
  }
  await new Promise<void>((resolve) => {
    stdin.on('end', resolve)
    stdin.on('close', resolve)
    stdin.on('error', resolve)
    stdin.resume()
  })
  server.stop()
}
