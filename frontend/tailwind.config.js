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
        // ── Core backgrounds ──
        background: '#060910',
        surface:    '#0b0f1e',
        card:       '#0e1525',
        border:     '#182036',
        // ── Trading status ──
        bullish: '#00e676',
        bearish: '#ff1744',
        neutral: '#ff9800',
        warning: '#ffc107',
        // ── Text hierarchy ──
        'text-primary':   '#eef2fa',
        'text-secondary': '#6e84a8',
        'text-muted':     '#3a4d6a',
        // ── Accent & brand ──
        accent:  '#3b82f6',
        'accent-glow': '#1d4ed8',
        purple:  '#8b5cf6',
        cyan:    '#06b6d4',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':     'fadeIn 0.4s ease both',
        'slide-up':    'slideUp 0.3s ease-out both',
        'glow':        'glowAnim 2s ease-in-out infinite alternate',
        'live-ping':   'livePing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer':     'shimmer 1.6s ease infinite',
        'float':       'floatAnim 3s ease-in-out infinite',
        'spin-slow':   'spin 8s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        glowAnim: {
          '0%':   { boxShadow: '0 0 6px rgba(59,130,246,0.2)' },
          '100%': { boxShadow: '0 0 28px rgba(59,130,246,0.55)' },
        },
        livePing: {
          '0%'  : { boxShadow: '0 0 0 0 rgba(0,230,118,0.55)' },
          '70%' : { boxShadow: '0 0 0 8px rgba(0,230,118,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(0,230,118,0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-600px 0' },
          '100%': { backgroundPosition:  '600px 0' },
        },
        floatAnim: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-4px)' },
        },
      },
      boxShadow: {
        'card':         '0 1px 3px rgba(0,0,0,0.6), 0 8px 32px rgba(0,0,0,0.35)',
        'card-hover':   '0 2px 4px rgba(0,0,0,0.6), 0 16px 48px rgba(0,0,0,0.45)',
        'bullish':      '0 0 30px rgba(0,230,118,0.18), 0 0 60px rgba(0,230,118,0.08)',
        'bearish':      '0 0 30px rgba(255,23,68,0.18),  0 0 60px rgba(255,23,68,0.08)',
        'accent':       '0 0 30px rgba(59,130,246,0.2),  0 0 60px rgba(59,130,246,0.08)',
        'inner-glow':   'inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      backgroundImage: {
        'gradient-radial':   'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':    'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'grid-dot':          'radial-gradient(circle, rgba(30,45,74,0.5) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
