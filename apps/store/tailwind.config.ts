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
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        'on-ink': 'var(--on-ink)',
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        lilac: 'var(--lilac)',
        sel: 'var(--sel)',
        fill: 'var(--fill)',
        danger: 'var(--red)',
        store: {
          wall: 'var(--wall)',
          win: 'var(--win)',
          sidebar: 'var(--sidebar)',
          content: 'var(--content)',
          chrome: 'var(--chrome)',
          panel: 'var(--panel)',
          'panel-2': 'var(--panel-2)',
          border: 'var(--border)',
          'border-strong': 'var(--border-strong)',
          text: 'var(--text)',
          'text-2': 'var(--text-2)',
          'text-3': 'var(--text-3)',
          accent: 'var(--accent)',
          'on-accent': 'var(--on-accent)',
          'accent-soft': 'var(--accent-soft)',
          green: 'var(--green)',
          'green-soft': 'var(--green-soft)',
          amber: 'var(--amber)',
          star: 'var(--star)',
          red: 'var(--red)',
          'code-bg': 'var(--code-bg)',
          'term-bg': 'var(--term-bg)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'PingFang SC', 'Noto Sans SC', 'ui-monospace', 'SF Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
