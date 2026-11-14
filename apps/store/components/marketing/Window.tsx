import Image from 'next/image'
import { useLocale } from 'next-intl'
import type { ReactNode } from 'react'

export interface Shot {
  name: string
  width: number
  height: number
}

// The native Linux window at 2x, one set per site language (test/desktop-linux/marketing.sh;
// its README says how to regenerate them). Sizes must match the files.
export const SHOTS = {
  install: { name: 'install', width: 2112, height: 1320 },
  skills: { name: 'skills', width: 2112, height: 1320 },
  skillsNarrow: { name: 'skills-narrow', width: 1600, height: 1000 },
  mcp: { name: 'mcp', width: 2560, height: 1600 },
  relay: { name: 'relay', width: 2112, height: 1320 },
  usage: { name: 'usage', width: 2112, height: 1320 },
} satisfies Record<string, Shot>

export function shotSrc(shot: Shot, locale: string): string {
  return `/landing/${locale === 'en' ? 'en' : 'zh'}/${shot.name}.webp`
}

/** A desktop window on a glowing frame. `kind` tints the glow with one category; without it the glow is the full spectrum. */
export function WindowFrame({
  title,
  kind,
  className = '',
  children,
}: {
  title: string
  kind?: 'skill' | 'mcp' | 'provider'
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`frame ${kind ? 'frame-one' : ''} ${className}`} data-kind={kind}>
      <div className="win">
        <div className="win-bar">
          <span aria-hidden className="win-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="win-title">{title}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

/** A screenshot of the real app in the page's language, cropped to 16:10 from the top left so every shot in a frame has the same height. */
export function AppShot({ shot, alt, sizes, priority = false }: { shot: Shot; alt: string; sizes: string; priority?: boolean }) {
  const locale = useLocale()
  return (
    <div className="aspect-[16/10] overflow-hidden">
      <Image
        src={shotSrc(shot, locale)}
        width={shot.width}
        height={shot.height}
        alt={alt}
        sizes={sizes}
        priority={priority}
        // Already cropped and compressed WebP; the optimizer would only re-encode it.
        unoptimized
        className="block h-full w-full object-cover object-left-top"
      />
    </div>
  )
}
