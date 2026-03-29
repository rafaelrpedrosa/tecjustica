/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1e3a5f',
        'primary-dark': '#162d4a',
        'primary-light': '#f0f4f8',
        surface: '#ffffff',
        bg: '#f8fafc',
        border: '#e8edf2',
        'border-subtle': '#f1f5f9',
        'text-strong': '#1e293b',
        'text-base': '#475569',
        'text-muted': '#94a3b8',
        'text-faint': '#cbd5e1',
        danger: '#dc2626',
        'danger-bg': '#fee2e2',
        success: '#16a34a',
        warning: '#d97706',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
