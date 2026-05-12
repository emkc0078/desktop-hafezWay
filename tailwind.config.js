/** @type {import('tailwindcss').Config} */
/* Aligned with front-hafezway/tailwind.config.js (Hafez Way design system) */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#12B76A',
          primaryDark: '#0B7F4A',
          primaryLight: '#48D383',
          productBlue: '#76DEA2',
          secondary: '#D2F4E0',
          accent: '#EAAA08',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#1F2937',
          background: '#F9FAFB',
          card: '#FFFFFF',
          cardDark: '#374151',
        },
        text: {
          primary: '#101828',
          secondary: '#344054',
          muted: '#667085',
          inverted: '#FFFFFF',
          accent: '#12B76A',
        },
        status: {
          success: '#12B76A',
          warning: '#EAAA08',
          error: '#F04438',
          info: '#12B76A',
        },
        gray: {
          50: '#F9FAFB',
          100: '#F2F4F7',
          200: '#E5E7EB',
          300: '#D0D5DD',
          400: '#9CA3AF',
          500: '#667085',
          600: '#475467',
          700: '#344054',
          800: '#1F2937',
          900: '#101828',
        },
      },
    },
  },
  plugins: [],
};
