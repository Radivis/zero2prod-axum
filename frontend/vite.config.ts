import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Proxy API endpoints and POST requests to backend
      // Use 127.0.0.1 instead of localhost to force IPv4
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/health_check': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/login': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // Only proxy POST requests, let Vite serve GET (React app)
        bypass(req) {
          if (req.method === 'GET') {
            return '/index.html';
          }
        },
      },
      '/initial_password': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        bypass(req) {
          if (req.method === 'GET') {
            return '/index.html';
          }
        },
      },
      '/subscriptions': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://127.0.0.1:8000',
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
