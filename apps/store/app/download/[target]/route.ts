import { NextResponse } from 'next/server'
import { RELEASE_REPO, RELEASES_PAGE } from '@/lib/latest-release'

// Resolve a download target to the matching asset on the latest GitHub Release
// and 302 to it, so the landing page always links to the newest installer for
// each platform without hardcoding a version. Falls back to the releases page.
// The macOS build is a single universal .dmg (Apple Silicon + Intel), so all mac
// targets resolve to the one dmg; mac-arm/mac-intel stay as aliases for old links.
const matchMac = (n: string) => n.endsWith('.dmg')
const MATCHERS: Record<string, (name: string) => boolean> = {
  mac: matchMac,
  'mac-arm': matchMac,
  'mac-intel': matchMac,
  win: (n) => n.endsWith('-setup.exe'),
  'linux-deb': (n) => n.endsWith('.deb'),
  'linux-rpm': (n) => n.endsWith('.rpm'),
  'linux-appimage': (n) => n.endsWith('.AppImage'),
}

export async function GET(_req: Request, { params }: { params: Promise<{ target: string }> }) {
  const { target } = await params
  const match = MATCHERS[target]
  if (!match) return NextResponse.redirect(RELEASES_PAGE, 302)

  try {
    const res = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 300 },
    })
    if (!res.ok) return NextResponse.redirect(RELEASES_PAGE, 302)
    const release = (await res.json()) as { assets?: { name: string; browser_download_url: string }[] }
    const asset = release.assets?.find((a) => match(a.name))
    return NextResponse.redirect(asset?.browser_download_url ?? RELEASES_PAGE, 302)
  } catch {
    return NextResponse.redirect(RELEASES_PAGE, 302)
  }
}
