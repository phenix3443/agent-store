import type { Config } from 'tailwindcss'

const kind = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: 'var(--bg)', 2: 'var(--bg-2)', 3: 'var(--bg-3)' },
        fg: { DEFAULT: 'var(--fg)', 2: 'var(--fg-2)', 3: 'var(--fg-3)' },
        panel: { DEFAULT: 'var(--panel)', 2: 'var(--panel-2)', 3: 'var(--panel-3)' },
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        edge: 'var(--edge)',
        code: 'var(--code)',
        well: 'var(--well)',
        nav: 'var(--nav)',
        pop: 'var(--pop)',
        scrim: 'var(--scrim)',
        skill: kind('skill'),
        mcp: kind('mcp'),
        provider: kind('provider'),
        warn: 'var(--warn)',
        bad: 'var(--bad)',

        // Names from the previous design, still used by pages that #160–#162 redo.
        // Remove each once nothing references it.
        paper: 'var(--bg)',
        plate: 'var(--bg-2)',
        ink: { DEFAULT: 'var(--fg)', 2: 'var(--fg-2)' },
        'on-ink': 'var(--bg)',
        sel: 'var(--panel-2)',
        fill: 'var(--panel)',
        danger: 'var(--bad)',
      },
      // The old design drew section rules in ink; at full text brightness they glare on the dark ground.
      borderColor: {
        ink: 'var(--fg-3)',
      },
      boxShadow: {
        nav: '0 10px 40px rgba(0, 0, 0, 0.35)',
        sheet: '0 0 120px rgba(0, 0, 0, 0.7)',
      },
      borderRadius: {
        control: 'var(--r)',
        card: 'var(--r-lg)',
        frame: 'var(--r-xl)',
      },
      fontFamily: {
        // --font-cjk is only defined on zh pages; the var() fallback keeps the stack valid elsewhere.
        sans: ['var(--font-sans)', 'var(--font-cjk, "PingFang SC")', 'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'var(--font-cjk, "PingFang SC")', 'PingFang SC', 'Noto Sans CJK SC', 'ui-monospace', 'SF Mono', 'monospace'],
      },
      transitionTimingFunction: {
        out: 'var(--ease)',
      },
    },
  },
  plugins: [],
}

export default config
