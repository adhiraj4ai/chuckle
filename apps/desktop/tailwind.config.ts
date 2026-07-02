import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Theme-aware semantic tokens (flip via the `dark` class). Defined as
        // "R G B" CSS vars so Tailwind opacity modifiers (text-fg/50) work.
        app: 'rgb(var(--app) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        rail: 'rgb(var(--rail) / <alpha-value>)',
        railfg: 'rgb(var(--railfg) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        // Exact artifact neutrals (theme-aware): secondary/tertiary text + soft
        // dividers. Use these instead of fg-opacity so grays match the mockup.
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        'border-soft': 'rgb(var(--border-soft) / <alpha-value>)',
        // Static palette (code blocks, brand, status — same in both themes)
        ink: { DEFAULT: '#16181d', soft: '#21242c', line: '#2c303a' },
        mist: '#f5f6f8',
        line: '#e6e8ec',
        iris: { DEFAULT: '#5b57d6', ink: '#4b47bd', soft: '#edecfb' },
        ok: { DEFAULT: '#1f9d6b', soft: '#e7f5ef' },
        wait: { DEFAULT: '#c77b16', soft: '#fbf0dd' },
        stop: { DEFAULT: '#d1495b', soft: '#fbe9ec' },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['Iowan Old Style', 'Palatino', 'Georgia', 'ui-serif', 'serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'Menlo', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(16, 18, 24, 0.05), 0 10px 30px rgba(16, 18, 24, 0.07)',
      },
    },
  },
  plugins: [],
} satisfies Config
