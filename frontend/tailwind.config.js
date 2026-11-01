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
        // Claude Dark Warm Charcoal Foundation
        background: '#1f1e1d',
        foreground: '#faf9f5',
        surface: {
          DEFAULT: '#262624',
          foreground: '#faf9f5',
        },
        raised: {
          DEFAULT: '#30302e',
          foreground: '#faf9f5',
        },
        card: {
          DEFAULT: '#262624',
          foreground: '#faf9f5',
        },
        popover: {
          DEFAULT: '#262624',
          foreground: '#faf9f5',
        },
        primary: {
          DEFAULT: '#d97757', // Terracotta single accent
          foreground: '#faf9f5',
        },
        secondary: {
          DEFAULT: '#30302e',
          foreground: '#faf9f5',
        },
        muted: {
          DEFAULT: '#30302e',
          foreground: '#a3a299',
        },
        accent: {
          DEFAULT: '#d97757',
          foreground: '#faf9f5',
        },
        terracotta: '#d97757',
        border: '#3d3d3a',
        input: '#3d3d3a',
        ring: '#d97757',

        // Semantic Muted Colors
        good: '#7fa37a', // Sage
        warn: '#d4a24c',
        bad: '#c96a5f',
        destructive: {
          DEFAULT: '#c96a5f',
          foreground: '#faf9f5',
        },

        // Named design tokens for Prodify
        'prodify-bg': '#1f1e1d',
        'prodify-surface': '#262624',
        'prodify-raised': '#30302e',
        'prodify-border': '#3d3d3a',
        'prodify-text': '#faf9f5',
        'prodify-muted': '#a3a299',
        'prodify-accent': '#d97757',
        'prodify-good': '#7fa37a',
        'prodify-warn': '#d4a24c',
        'prodify-bad': '#c96a5f',

        // Fallbacks for any legacy tokens
        paper: '#1f1e1d',
        sidebar: '#1f1e1d',
        well: '#262624',
        line: '#3d3d3a',
        'line-strong': '#3d3d3a',
        ink: '#faf9f5',
      },
      fontFamily: {
        heading: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        body: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem', // 16px
        xl: '0.75rem', // 12px
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
      boxShadow: {
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        none: 'none',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
