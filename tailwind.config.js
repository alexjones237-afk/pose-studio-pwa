/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: '#121216',
          panel: '#18181f',
          elevated: '#22222c',
          border: 'rgba(255, 255, 255, 0.09)',
          accent: '#6366f1',
          accentBright: '#818cf8',
        },
      },
    },
  },
  plugins: [],
};
