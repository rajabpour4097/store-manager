/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Vazirmatn', 'system-ui', 'sans-serif'],
        display: ['Vazirmatn', 'system-ui', 'sans-serif'],
        mono: ['Vazirmatn', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd3ff',
          300: '#8eb5ff',
          400: '#598cff',
          500: '#3563ff',
          600: '#1f41f5',
          700: '#1a31e1',
          800: '#1c2bb6',
          900: '#1c2b8f',
          950: '#151c57',
        },
        ink: {
          50: '#f6f7fb',
          100: '#eceef6',
          200: '#d5daea',
          300: '#b0b9d6',
          400: '#8592bd',
          500: '#6673a4',
          600: '#515b88',
          700: '#434a6e',
          800: '#3a3f5d',
          900: '#22263a',
          950: '#151827',
        },
        teal: {
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
        },
        amberx: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        rose: {
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 6px 20px -6px rgba(16, 24, 40, 0.10)',
        'card-lg': '0 2px 4px rgba(16, 24, 40, 0.04), 0 16px 40px -12px rgba(16, 24, 40, 0.16)',
        glow: '0 0 0 4px rgba(53, 99, 255, 0.12)',
        'inner-top': 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.35s ease-out both',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-down': 'slideDown 0.25s ease-out both',
        'scale-in': 'scaleIn 0.2s ease-out both',
        shimmer: 'shimmer 1.6s linear infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { transform: 'translateY(14px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.96)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      backgroundImage: {
        'grid-light':
          'linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)',
        'brand-gradient': 'linear-gradient(135deg, #3563ff 0%, #6d4bff 50%, #a855f7 100%)',
        'mesh-light':
          'radial-gradient(at 15% 15%, rgba(53,99,255,0.10) 0px, transparent 55%), radial-gradient(at 85% 10%, rgba(168,85,247,0.10) 0px, transparent 50%), radial-gradient(at 75% 85%, rgba(20,184,166,0.10) 0px, transparent 50%)',
        'mesh-dark':
          'radial-gradient(at 15% 15%, rgba(53,99,255,0.18) 0px, transparent 55%), radial-gradient(at 85% 10%, rgba(168,85,247,0.16) 0px, transparent 50%), radial-gradient(at 75% 85%, rgba(20,184,166,0.14) 0px, transparent 50%)',
      },
    },
  },
  plugins: [],
}
