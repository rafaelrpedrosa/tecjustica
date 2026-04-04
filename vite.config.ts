import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react')) return 'vendor-react'
          if (id.includes('node_modules/react-dom')) return 'vendor-react'
          if (id.includes('node_modules/@supabase')) return 'vendor-supabase'
          if (id.includes('node_modules/@tanstack')) return 'vendor-query'
          if (id.includes('node_modules/@anthropic')) return 'vendor-anthropic'
          if (id.includes('/src/pages/')) return 'pages'
          if (id.includes('/src/services/')) return 'services'
          if (id.includes('/src/components/')) return 'components'
          if (id.includes('/src/hooks/')) return 'hooks'
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
