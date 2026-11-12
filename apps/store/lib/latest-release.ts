import type { DesktopOs } from './desktop-os'

export const RELEASE_REPO = 'awesome-agent-store/agent-store'
export const RELEASES_PAGE = `https://github.com/${RELEASE_REPO}/releases/latest`

export type ReleaseFileKind = 'dmg' | 'exe' | 'msi' | 'deb' | 'rpm'

export interface ReleaseFile {
  kind: ReleaseFileKind
  name: string
  size: number
  url: string
  /** The file a plain "download for <os>" link resolves to (`/download/<target>`). */
  recommended: boolean
}

export interface ReleasePlatform {
  os: DesktopOs
  files: ReleaseFile[]
}

export interface LatestRelease {
  version: string
  url: string
  platforms: ReleasePlatform[]
}

interface GithubAsset {
  name: string
  size: number
  browser_download_url: string
}

const KINDS: { kind: ReleaseFileKind; os: DesktopOs; match: (name: string) => boolean; recommended: boolean }[] = [
  { kind: 'dmg', os: 'mac', match: (n) => n.endsWith('.dmg'), recommended: true },
  { kind: 'exe', os: 'win', match: (n) => n.endsWith('-setup.exe'), recommended: true },
  { kind: 'msi', os: 'win', match: (n) => n.endsWith('.msi'), recommended: false },
  // Debian/Ubuntu and Fedora/openSUSE are both common, so neither Linux package is the default.
  { kind: 'deb', os: 'linux', match: (n) => n.endsWith('.deb'), recommended: false },
  { kind: 'rpm', os: 'linux', match: (n) => n.endsWith('.rpm'), recommended: false },
]

const OS_ORDER: DesktopOs[] = ['mac', 'win', 'linux']

/** Installer files of a GitHub release, grouped by OS; null when it has none we recognise. */
export function parseRelease(json: unknown): LatestRelease | null {
  if (!json || typeof json !== 'object') return null
  const release = json as { tag_name?: unknown; html_url?: unknown; assets?: unknown }
  if (typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) return null
  const assets = (release.assets as unknown[]).filter(
    (a): a is GithubAsset =>
      !!a &&
      typeof (a as GithubAsset).name === 'string' &&
      typeof (a as GithubAsset).size === 'number' &&
      typeof (a as GithubAsset).browser_download_url === 'string',
  )
  const platforms = OS_ORDER.map((os) => ({
    os,
    files: KINDS.filter((k) => k.os === os).flatMap((k) => {
      const asset = assets.find((a) => k.match(a.name))
      return asset
        ? [{ kind: k.kind, name: asset.name, size: asset.size, url: asset.browser_download_url, recommended: k.recommended }]
        : []
    }),
  })).filter((p) => p.files.length > 0)
  if (platforms.length === 0) return null
  return {
    version: release.tag_name,
    url: typeof release.html_url === 'string' ? release.html_url : RELEASES_PAGE,
    platforms,
  }
}

/** Latest release from GitHub, cached for 5 minutes; null when GitHub cannot be reached, so the page links to the releases page instead. */
export async function getLatestRelease(): Promise<LatestRelease | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return parseRelease(await res.json())
  } catch {
    return null
  }
}

/** Binary megabytes, one decimal under 10 MB: 45092220 → "43 MB". */
export function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}
