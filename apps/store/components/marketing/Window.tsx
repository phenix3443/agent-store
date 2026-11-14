import Image from 'next/image'
import type { ReactNode } from 'react'

export interface Shot {
  src: string
  width: number
  height: number
}

// Crops of the native Linux window (test/desktop-linux, Xvfb), not the dev page in a browser.
export const SHOTS = {
  skills: { src: '/landing/hero.webp', width: 1186, height: 706 },
  skillsNarrow: { src: '/landing/skills.webp', width: 800, height: 500 },
  mcp: { src: '/landing/mcp.webp', width: 800, height: 500 },
  relay: { src: '/landing/relay.webp', width: 760, height: 475 },
  usage: { src: '/landing/usage.webp', width: 960, height: 600 },
} satisfies Record<string, Shot>

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

/** A screenshot of the real app, cropped to 16:10 from the top left so every shot in a frame has the same height. */
export function AppShot({ shot, alt, sizes, priority = false }: { shot: Shot; alt: string; sizes: string; priority?: boolean }) {
  return (
    <div className="aspect-[16/10] overflow-hidden">
      <Image
        src={shot.src}
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
