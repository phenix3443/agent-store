import type { Shot } from './Screenshot'

// Crops of the native Linux window (test/desktop-linux, Xvfb), not the dev page in a browser.
export const SHOTS = {
  hero: { src: '/landing/hero.webp', width: 1186, height: 706 },
  skill: { src: '/landing/skills.webp', width: 800, height: 500 },
  mcp: { src: '/landing/mcp.webp', width: 800, height: 500 },
  relay: { src: '/landing/relay.webp', width: 760, height: 475 },
  usage: { src: '/landing/usage.webp', width: 960, height: 600 },
} satisfies Record<string, Shot>
