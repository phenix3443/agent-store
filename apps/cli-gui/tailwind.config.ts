import type { Config } from 'tailwindcss'

const rgb = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font)'],
        mono: ['var(--mono)'],
      },
      borderRadius: {
        ctl: 'var(--r)',
        box: '12px',
        overlay: '16px',
        hero: 'var(--r-lg)',
      },
      transitionTimingFunction: {
        out: 'var(--ease)',
      },
      colors: {
        canvas: { DEFAULT: 'var(--bg)', 2: 'var(--bg-2)', 3: 'var(--bg-3)' },
        edge: 'var(--edge)',
        panel: { DEFAULT: 'var(--panel)', 2: 'var(--panel-2)' },
        code: 'var(--code)',
        popover: 'var(--popover)',
        overlay: 'var(--overlay)',
        scrim: 'var(--scrim)',
        fg: { DEFAULT: 'var(--fg)', 2: 'var(--fg2)', 3: 'var(--fg3)' },
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        skill: rgb('skill'),
        mcp: rgb('mcp'),
        provider: rgb('provider'),
        warn: rgb('warn'),
        bad: rgb('bad'),
        kind: rgb('kind'),
      },
    },
  },
  plugins: [],
}

export default config
