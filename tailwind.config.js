/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",          // فایل‌های روت مثل App.tsx
    "./components/**/*.{js,ts,jsx,tsx}", // پوشه کامپوننت‌ها
    "./pages/**/*.{js,ts,jsx,tsx}",      // پوشه صفحات
    "./src/**/*.{js,ts,jsx,tsx}"         // محض احتیاط اگر پوشه src هم بود
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        leather: {
          50: '#eef5f0',
          100: '#dbe9df',
          200: '#b9d2c1',
          300: '#8bb49a',
          400: '#5f9075',
          500: '#356d52',
          600: '#285641',
          700: '#1f4534',
          800: '#17372a',
          900: '#11291f',
        },
        dark: {
          bg: '#141414',
          surface: '#1f1f1f',
          border: '#303030',
        }
      },
      fontFamily: {
        sans: ['Vazirmatn', 'ui-sans-serif', 'system-ui'],
      }
    },
  },
  plugins: [],
}
