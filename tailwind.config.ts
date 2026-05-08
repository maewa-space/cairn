import type { Config } from 'tailwindcss';

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'oklch(var(--surface) / <alpha-value>)',
        'surface-2': 'oklch(var(--surface-2) / <alpha-value>)',
        ink: 'oklch(var(--ink) / <alpha-value>)',
        'ink-muted': 'oklch(var(--ink-muted) / <alpha-value>)',
        'ink-soft': 'oklch(var(--ink-soft) / <alpha-value>)',
        accent: 'oklch(var(--accent) / <alpha-value>)',
        'accent-2': 'oklch(var(--accent-2) / <alpha-value>)',
        edge: 'oklch(var(--edge) / <alpha-value>)',
        sage: 'oklch(var(--sage) / <alpha-value>)',
        moss: 'oklch(var(--moss) / <alpha-value>)',
        stone: 'oklch(var(--stone) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Newsreader"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightish: '-0.012em',
        tighter2: '-0.022em',
      },
      borderRadius: {
        xs: '4px',
      },
    },
  },
  plugins: [],
} satisfies Config;
