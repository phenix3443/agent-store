import { ImageResponse } from 'next/og'

export const alt = 'Agent Store: skills, MCP servers and providers for your agents'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Satori cannot read CSS variables, so these repeat the tokens in globals.css.
const BG = '#0b0a12'
const BG_3 = '#151322'
const FG = '#f3f2f8'
const FG_2 = '#a5a2b8'
const LINE = 'rgba(255,255,255,0.18)'
const SKILL = '#b79cff'
const MCP = '#62b8ff'
const PROVIDER = '#5fd6a4'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: BG,
          backgroundImage: [
            'radial-gradient(circle at 12% 0%, rgba(139,108,255,0.45), transparent 45%)',
            'radial-gradient(circle at 55% -10%, rgba(47,141,255,0.4), transparent 45%)',
            'radial-gradient(circle at 95% 5%, rgba(34,184,137,0.35), transparent 45%)',
          ].join(', '),
          color: FG,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              border: `2px solid ${LINE}`,
              background: BG_3,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              gap: 6,
              padding: '12px 0',
            }}
          >
            <div style={{ width: 8, height: 18, borderRadius: 4, background: SKILL }} />
            <div style={{ width: 8, height: 30, borderRadius: 4, background: MCP }} />
            <div style={{ width: 8, height: 22, borderRadius: 4, background: PROVIDER }} />
          </div>
          <div style={{ fontSize: 36, fontWeight: 800 }}>Agent Store</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.1, letterSpacing: -2 }}>Everything your agents need</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.1, letterSpacing: -2, color: FG_2 }}>All in one place</div>
          <div style={{ marginTop: 36, fontSize: 28, color: FG_2 }}>
            Works with Claude Code and Codex today. More agents on the way.
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
