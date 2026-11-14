/**
 * Where to send the visitor after signing in: a path on this site, or null.
 * `//host` and `/\host` are protocol-relative to another site in browsers.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2000) return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null
  try {
    const url = new URL(raw, 'https://same.invalid')
    if (url.origin !== 'https://same.invalid') return null
    if (url.pathname.startsWith('/auth/')) return null
    return url.pathname + url.search + url.hash
  } catch {
    return null
  }
}
