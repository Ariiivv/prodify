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
        // Claude Dark Theme Foundation (Charcoal-Slate)
        background: '#09090b',
        foreground: '#f4f4f5',
        card: {
          DEFAULT: '#18181b',
          foreground: '#f4f4f5',
        },
        popover: {
          DEFAULT: '#18181b',
          foreground: '#f4f4f5',
        },
        primary: {
          DEFAULT: '#ffffff',
          foreground: '#09090b',
        },
        secondary: {
          DEFAULT: '#27272a',
          foreground: '#f4f4f5',
        },
        muted: {
          DEFAULT: '#27272a',
          foreground: '#a1a1aa',
        },
        accent: {
          DEFAULT: '#27272a',
          foreground: '#f4f4f5',
        },
        destructive: {
          DEFAULT: '#ef4444',
          foreground: '#ffffff',
        },
        border: '#27272a',
        input: '#27272a',
        ring: '#3f3f46',

        // Explicit Claude design tokens
        'prodify-bg': '#09090b',
        'prodify-surface': '#18181b',
        'prodify-surface-alt': '#27272a',
        'prodify-border': '#27272a',
        'prodify-muted': '#a1a1aa',
        'prodify-accent': '#ffffff',
        'prodify-success': '#10b981',
        'prodify-warning': '#f59e0b',
        'prodify-danger': '#ef4444',

        // Fallbacks for any legacy tokens to dark equivalents
        paper: '#09090b',
        sidebar: '#121214',
        well: '#18181b',
        line: '#27272a',
        'line-strong': '#3f3f46',
        ink: '#f4f4f5',
      },
      fontFamily: {
        heading: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.4)',
        DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.5), 0 1px 2px -1px rgba(0, 0, 0, 0.5)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.5)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
