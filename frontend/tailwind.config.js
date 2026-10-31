import tailwindcssAnimate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Prodify "Warm Paper, One Lime Highlighter" Palette ──
        paper: '#F6F5F0',
        card: '#FFFFFF',
        ink: '#111110',
        muted: '#6F6E68',
        line: '#E5E3DA',
        lime: '#C8F53C',
        indigo: '#5B3DF5',
        amber: '#E8A317',
        red: '#E5484D',

        // ── Shadcn semantic mappings ──
        background: 'var(--paper)',
        foreground: 'var(--ink)',
        border: 'var(--line)',
        input: 'var(--line)',
        ring: 'var(--indigo)',
        primary: {
          DEFAULT: '#111110',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#E5E3DA',
          foreground: '#111110',
        },
        destructive: {
          DEFAULT: '#E5484D',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#C8F53C',
          foreground: '#111110',
        },
        popover: {
          DEFAULT: '#FFFFFF',
          foreground: '#111110',
        },
        // Legacy compatibility aliases
        'prodify-bg': '#F6F5F0',
        'prodify-surface': '#FFFFFF',
        'prodify-surface-alt': '#F0EFEA',
        'prodify-border': '#E5E3DA',
        'prodify-muted': '#6F6E68',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'system-ui', 'sans-serif'],
        body: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.045em',
        tighter: '-0.03em',
        tight: '-0.015em',
      },
      lineHeight: {
        display: '0.95',
        tight: '1.1',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(17, 17, 16, 0.04)',
        hover: '0 4px 12px 0 rgba(17, 17, 16, 0.06)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
