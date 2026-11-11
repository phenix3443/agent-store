import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        plate: 'var(--plate)',
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)' },
        'on-ink': 'var(--on-ink)',
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        lilac: 'var(--lilac)',
        sel: 'var(--sel)',
        fill: 'var(--fill)',
        danger: 'var(--red)',
        scrim: 'var(--scrim)',
      },
      fontFamily: {
        // --font-cjk is only defined on zh pages; the var() fallback keeps the stack valid elsewhere.
        sans: ['var(--font-sans)', 'var(--font-cjk, "PingFang SC")', 'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'var(--font-cjk, "PingFang SC")', 'PingFang SC', 'Noto Sans CJK SC', 'ui-monospace', 'SF Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
