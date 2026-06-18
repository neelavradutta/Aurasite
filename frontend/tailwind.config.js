/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './utils/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#0a0e27',
          cyan: '#00f7ff',
          purple: '#d946ef',
          pink: '#ff006e',
          green: '#84ff00',
          panel: 'rgba(15, 23, 58, 0.75)',
        },
      },
      fontFamily: {
        heading: ['Montserrat', 'Segoe UI', 'sans-serif'],
        orbitron: ['Orbitron', 'sans-serif'],
        mono: ['JetBrains Mono', 'Space Mono', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 20px rgba(0, 247, 255, 0.35)',
        'neon-pink': '0 0 20px rgba(255, 0, 110, 0.35)',
        'neon-green': '0 0 20px rgba(132, 255, 0, 0.35)',
      },
    },
  },
  plugins: [],
};
