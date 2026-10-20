import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dedicated ports so this project never collides with other local projects
// (3000/5173/8080 are the usual defaults). strictPort makes Vite fail loudly
// instead of silently hopping to another port.
const DEV_PORT = 4810
const PREVIEW_PORT = 4811

export default defineConfig({
  plugins: [react()],
  server: { port: DEV_PORT, strictPort: true, host: '127.0.0.1' },
  preview: { port: PREVIEW_PORT, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) expects the function form
        manualChunks(id: string) {
          if (id.includes('/node_modules/three/')) return 'three'
          if (/\/node_modules\/(@react-three|postprocessing|three-stdlib|maath)\//.test(id)) return 'r3f'
          return undefined
        },
      },
    },
  },
})
