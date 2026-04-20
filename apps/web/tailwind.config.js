/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,ts,jsx,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        'green-dark': '#1F3D2B',
        'green-sage': '#7A9E7E',
        'amber-ocre': '#D4A24C',
        cream: '#FAF6EE',
        ink: {
          DEFAULT: '#1A1A1A',
          muted: '#5C5C5C',
        },
        'border-soft': '#E5E1D6',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['Geist', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
