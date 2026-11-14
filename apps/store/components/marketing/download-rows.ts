import type { DesktopOs } from '@/lib/desktop-os'
import { formatSize, type LatestRelease, type ReleaseFileKind } from '@/lib/latest-release'

const OS_ORDER: DesktopOs[] = ['mac', 'win', 'linux']
export const OS_KIND = { mac: 'skill', win: 'mcp', linux: 'provider' } as const
export const EXT: Record<ReleaseFileKind, string> = {
  dmg: '.dmg',
  exe: '.exe',
  msi: '.msi',
  deb: '.deb',
  rpm: '.rpm',
  appimage: '.AppImage',
}
// When the release can't be read, the route handlers still redirect to the newest asset.
const FALLBACK: Record<DesktopOs, { kind: ReleaseFileKind; href: string }[]> = {
  mac: [{ kind: 'dmg', href: '/download/mac' }],
  win: [{ kind: 'exe', href: '/download/win' }],
  linux: [
    { kind: 'deb', href: '/download/linux-deb' },
    { kind: 'rpm', href: '/download/linux-rpm' },
    { kind: 'appimage', href: '/download/linux-appimage' },
  ],
}

export interface FileRow {
  kind: ReleaseFileKind
  href: string
  size: string | null
}

/** The visitor's system first; the route handlers stand in for the files when the release can't be read. */
export function downloadRows(release: LatestRelease | null, visitorOs: DesktopOs | null): { os: DesktopOs; files: FileRow[] }[] {
  const files = (os: DesktopOs): FileRow[] => {
    if (!release) return FALLBACK[os].map((f) => ({ ...f, size: null }))
    const platform = release.platforms.find((p) => p.os === os)
    return (platform?.files ?? []).map((f) => ({ kind: f.kind, href: f.url, size: formatSize(f.size) }))
  }
  return OS_ORDER.map((os) => ({ os, files: files(os) }))
    .filter((p) => p.files.length > 0)
    .sort((a, b) => Number(b.os === visitorOs) - Number(a.os === visitorOs))
}
