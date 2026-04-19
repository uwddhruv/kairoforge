import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: '#7B5EDB',
          foreground: '#ffffff',
          50: '#f0ebff',
          100: '#ddd2ff',
          200: '#c4abff',
          300: '#a37fff',
          400: '#8a5fff',
          500: '#7B5EDB',
          600: '#5e3dc0',
          700: '#4a2fa0',
          800: '#3D2C8D',
          900: '#2a1e6b',
        },
        secondary: {
          DEFAULT: '#1a1a2e',
          foreground: '#a0a0b0',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: '#7B5EDB',
          foreground: '#ffffff',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: '#111118',
          foreground: '#e0e0f0',
        },
        // KairoForge brand colors
        kf: {
          bg: '#0A0A0F',
          card: '#111118',
          cardHover: '#14141e',
          border: 'rgba(255,255,255,0.08)',
          primary: '#7B5EDB',
          primaryDark: '#3D2C8D',
          text: '#e0e0f0',
          muted: '#6b6b80',
          success: '#22c55e',
          danger: '#ef4444',
          warning: '#f59e0b',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(123,94,219,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(123,94,219,0.6)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'kf-gradient': 'linear-gradient(135deg, #3D2C8D 0%, #7B5EDB 100%)',
        'kf-card': 'linear-gradient(145deg, #111118 0%, #13131f 100%)',
      },
      boxShadow: {
        'kf-glow': '0 0 30px rgba(123,94,219,0.15)',
        'kf-glow-lg': '0 0 60px rgba(123,94,219,0.25)',
        'kf-card': '0 4px 24px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
