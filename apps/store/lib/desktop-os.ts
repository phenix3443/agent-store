import Bowser from 'bowser'

export type DesktopOs = 'mac' | 'win' | 'linux'

/** The desktop client platform matching this user agent; null for phones, tablets, ChromeOS and unknowns. */
export function desktopOsFromUserAgent(userAgent: string | null | undefined): DesktopOs | null {
  if (!userAgent) return null
  const parser = Bowser.getParser(userAgent)
  if (parser.getPlatformType(true) !== 'desktop') return null
  switch (parser.getOSName(true)) {
    case 'macos':
      return 'mac'
    case 'windows':
      return 'win'
    case 'linux':
      return 'linux'
    default:
      return null
  }
}
