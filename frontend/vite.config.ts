import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Proxy API endpoints and POST requests to backend
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/health_check': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/login': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Only proxy POST requests, let Vite serve GET (React app)
        bypass(req) {
          if (req.method === 'GET') {
            return '/index.html';
          }
        },
      },
      '/initial_password': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass(req) {
          if (req.method === 'GET') {
            return '/index.html';
          }
        },
      },
      '/subscriptions': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Only proxy POST requests, let Vite serve GET (React app)
        bypass(req) {
          if (req.method === 'GET') {
            return '/index.html';
          }
        },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
