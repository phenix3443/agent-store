import type { SVGProps } from 'react'

// Category and navigation glyphs from the approved prototype (docs/design/mockups/client-app/app.js);
// generic icons come from lucide-react.
const PATHS = {
  discover: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  skill: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  mcp: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8.5 6h7M7 8.3l4 7.4M17 8.3l-4 7.4" />
    </>
  ),
  provider: (
    <>
      <rect x="3" y="4" width="18" height="6" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
      <path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" />
    </>
  ),
  usage: <path d="M5 20V11M11 20V5M17 20v-7M2 20h20" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
}

export type GlyphName = keyof typeof PATHS

export function Glyph({ name, ...rest }: { name: GlyphName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}

/** The three-bar mark: one bar per category color. */
export function Logo() {
  return (
    <span aria-hidden className="flex h-5 w-5 flex-none items-end justify-center gap-0.5 rounded-md border border-line-strong bg-canvas-3 py-1">
      <i className="h-1.5 w-[3px] rounded-sm bg-skill" />
      <i className="h-2.5 w-[3px] rounded-sm bg-mcp" />
      <i className="h-2 w-[3px] rounded-sm bg-provider" />
    </span>
  )
}
