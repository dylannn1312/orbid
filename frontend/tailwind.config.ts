import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-2': 'var(--bg-2)',
        surface: 'var(--surface-solid)',
        raised: 'var(--raised)',
        border: 'var(--border)',
        'border-bright': 'var(--border-bright)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        azure: 'var(--azure)',
        violet: 'var(--violet)',
        gold: 'var(--gold)',
        'gold-deep': 'var(--gold-deep)',
        teal: 'var(--teal)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        gold: '0 0 28px -4px rgba(241, 196, 90, 0.45)',
        glow: '0 0 36px -6px rgba(122, 162, 247, 0.4)',
        'glow-violet': '0 0 36px -6px rgba(176, 139, 251, 0.4)',
      },
    },
  },
  plugins: [],
};

export default config;
