/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand LobsterCode
        lobster: {
          DEFAULT: '#d63a28',
          light: '#e95a45',
          dark: '#b52e1f',
          dim: 'rgba(214, 58, 40, 0.08)',
          glow: 'rgba(214, 58, 40, 0.15)',
        },
        ocean: '#2a8fb5',
        coral: '#e87554',
        sand: '#c4a35a',
        // Backgrounds warm cream
        cream: {
          50: '#faf7f5',
          100: '#f0ebe8',
          200: '#e8e0dc',
          300: '#e0d5d0',
          400: '#b0a09a',
        },
        // Dark sidebar
        sidebar: {
          DEFAULT: '#1c1214',
          hover: '#2a1e1c',
          active: '#3a2520',
          border: '#3a2822',
        },
        // Text
        bark: {
          DEFAULT: '#2a1a17',
          secondary: '#7a6560',
          dim: '#b0a09a',
        },
        // Status — semaforo
        status: {
          green: '#2e8b57',
          'green-light': '#10b981',
          yellow: '#e89530',
          'yellow-light': '#f59e0b',
          red: '#d63a28',
          'red-light': '#fc8181',
          gray: '#9ca3af',
          info: '#2a8fb5',
        },
        // Tool/card surfaces
        tool: {
          bg: '#fff8f6',
          border: '#f0d8d2',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'Segoe UI', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      borderRadius: {
        'card': '12px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(42, 26, 23, 0.06), 0 1px 2px rgba(42, 26, 23, 0.04)',
        'card-hover': '0 4px 6px rgba(42, 26, 23, 0.08), 0 2px 4px rgba(42, 26, 23, 0.04)',
        'lobster': '0 0 0 3px rgba(214, 58, 40, 0.15)',
      },
    },
  },
  plugins: [],
};
