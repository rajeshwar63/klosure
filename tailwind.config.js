/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1A1A2E',
        klo: '#4F8EF7',
        'klo-bg': '#E8F0FE',
        'chat-bg': '#ECE5DD',
        'seller-bubble': '#DCF8C6'
      },
      fontFamily: {
        sans: ['Inter', 'DM Sans', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
