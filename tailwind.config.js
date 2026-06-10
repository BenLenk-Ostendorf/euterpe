/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark Academia trifft Jazz-Club
        ink: {
          900: '#14100d', // tiefes Anthrazit/Mahagoni (Hintergrund)
          800: '#1c1713',
          700: '#241d18',
          600: '#2f261f',
          500: '#3a2f26',
        },
        amber: {
          glow: '#e0b15e', // Pentatonik-Markierung (warmes Gold/Bernstein)
          deep: '#c8923c',
          soft: '#f0d49a',
        },
        chord: '#7fa8c9', // Akkord-/Sekundärakzent (kühl, gedämpft)
        bone: '#efe6d6', // gebrochenes Weiß für Tasten/Text
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
