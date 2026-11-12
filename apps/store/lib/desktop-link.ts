const DEFAULT_SCHEME = 'agent-store'

/** Dev builds of the desktop client register `agent-store-dev`; NEXT_PUBLIC_DESKTOP_SCHEME selects it at build time. */
export function desktopScheme(): string {
  const configured = process.env.NEXT_PUBLIC_DESKTOP_SCHEME?.trim() ?? ''
  return /^[a-z][a-z0-9+.-]*$/.test(configured) ? configured : DEFAULT_SCHEME
}

/**
 * The link carries only identifiers: the client looks the package up in the
 * catalog itself, so a crafted link cannot smuggle in a URL or command. Today's
 * client reads `slug` and `category` and drops `id`, the /api/resources id it
 * will resolve once it reads that catalog.
 */
export function installLink(target: { slug: string; kind: string; id: string }, scheme = desktopScheme()): string {
  return `${scheme}://install?slug=${encodeURIComponent(target.slug)}&category=${target.kind}&id=${encodeURIComponent(target.id)}`
}

export type LaunchResult = 'opened' | 'missing'

/**
 * A page cannot ask whether a custom scheme has a handler. The usual signal:
 * when the OS hands the link to an app (or the browser asks to), this page
 * loses focus or is hidden within a moment; if nothing happens, nothing took it.
 *
 * The link is opened in a hidden iframe because assigning it to
 * window.location replaces the page with an error screen in Firefox when no
 * handler exists.
 */
export function launchDesktop(url: string, timeoutMs = 1500): Promise<LaunchResult> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.hidden = true
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1

    function finish(result: LaunchResult) {
      clearTimeout(timer)
      window.removeEventListener('blur', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      frame.remove()
      resolve(result)
    }
    function onLeave() {
      finish('opened')
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') finish('opened')
    }

    const timer = setTimeout(() => finish('missing'), timeoutMs)
    window.addEventListener('blur', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    document.body.appendChild(frame)
    try {
      frame.src = url
    } catch {
      finish('missing')
    }
  })
}
