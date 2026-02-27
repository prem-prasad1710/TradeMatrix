/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Trading dashboard color palette
        background: '#0a0e1a',
        surface: '#0f1629',
        card: '#131d33',
        border: '#1e2d4a',
        // Status colors
        bullish: '#00d264',
        bearish: '#ff3d5a',
        neutral: '#f0a500',
        warning: '#ff8c00',
        // Text
        'text-primary': '#e0e6f0',
        'text-secondary': '#7a8fb0',
        'text-muted': '#4a5872',
        // Accent
        accent: '#3b82f6',
        'accent-glow': '#1d4ed8',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(59, 130, 246, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(59, 130, 246, 0.6)' },
        },
      },
      boxShadow: {
        'card': '0 4px 24px rgba(0, 0, 0, 0.4)',
        'bullish': '0 0 20px rgba(0, 210, 100, 0.15)',
        'bearish': '0 0 20px rgba(255, 61, 90, 0.15)',
        'accent': '0 0 20px rgba(59, 130, 246, 0.2)',
      },
    },
  },
  plugins: [],
};
