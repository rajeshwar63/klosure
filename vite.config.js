import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Phase 4 (Week 10): performance optimisation for slow Gulf mobile connections.
// We split vendor bundles so the dashboard ships in a small chunk that the
// service worker can hold in cache, and the heavier deal-room flows stream in
// only when the seller actually opens a deal.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2020',
    cssMinify: true,
    sourcemap: false,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-router')) return 'router'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('react/') || id.includes('react-dom') || id.endsWith('react')) {
            return 'react'
          }
          return 'vendor'
        },
      },
    },
  },
})
