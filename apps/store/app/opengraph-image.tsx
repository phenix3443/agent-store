import { ImageResponse } from 'next/og'

export const alt = 'Agent Store — skills, MCP servers & providers for Claude Code / Codex'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Satori cannot read CSS variables, so the light-theme tokens from globals.css are repeated here.
const PAPER = '#f5f4f6'
const PLATE = '#faf6f5'
const INK = '#16181a'
const INK_2 = '#55585c'
const LINE = '#c9c7c4'
const LILAC = '#dcddf3'

function Mark({ style }: { style: React.CSSProperties }) {
  return (
    <div style={{ position: 'absolute', width: 15, height: 15, display: 'flex', ...style }}>
      <div style={{ position: 'absolute', left: 7, top: 0, width: 1, height: 15, background: INK }} />
      <div style={{ position: 'absolute', top: 7, left: 0, width: 15, height: 1, background: INK }} />
    </div>
  )
}

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', padding: 56, background: PAPER, color: INK, fontFamily: 'sans-serif' }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', background: PLATE, padding: '56px 64px' }}>
          <Mark style={{ left: -8, top: -8 }} />
          <Mark style={{ right: -8, top: -8 }} />
          <Mark style={{ left: -8, bottom: -8 }} />
          <Mark style={{ right: -8, bottom: -8 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 22, height: 22, borderRadius: 999, background: INK }} />
            <div style={{ fontSize: 34, fontWeight: 600 }}>Agent Store</div>
          </div>
          <div style={{ marginTop: 44, fontSize: 72, lineHeight: 1.04, letterSpacing: -2, maxWidth: 820 }}>
            One entry, every agent capability.
          </div>
          <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${LINE}`, fontSize: 28, color: INK_2, maxWidth: 820 }}>
            Skills, MCP servers and providers for Claude Code / Codex. Every package lists what runs on install.
          </div>
          <div
            style={{
              position: 'absolute',
              right: 64,
              bottom: 56,
              width: 150,
              height: 150,
              borderRadius: 999,
              background: LILAC,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: 'rotate(-13deg)',
              fontSize: 26,
              letterSpacing: 3,
            }}
          >
            REVIEWED
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
