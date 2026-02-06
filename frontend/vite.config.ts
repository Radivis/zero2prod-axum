import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Get backend port from environment variable, default to 8000
const backendPort = process.env.BACKEND_PORT || '8000';
const backendUrl = `http://127.0.0.1:${backendPort}`;

console.log(`[VITE CONFIG] Backend proxy target: ${backendUrl}`);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Proxy API endpoints and POST requests to backend
      // Use 127.0.0.1 instead of localhost to force IPv4
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/health_check': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/login': {
        target: backendUrl,
        changeOrigin: true,
        // Only proxy POST requests, let Vite serve GET (React app)
        bypass(req) {
          if (req.method === 'GET') {
            return '/index.html';
          }
        },
      },
      '/initial_password': {
        target: backendUrl,
        changeOrigin: true,
        bypass(req) {
          if (req.method === 'GET') {
            return '/index.html';
          }
        },
      },
      '/subscriptions': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/admin': {
        target: backendUrl,
        changeOrigin: true,
        // Proxy API routes (newsletters, password, logout, blog/posts), bypass page routes
        bypass(req) {
          // Always proxy these admin API endpoints regardless of method
          const apiPaths = ['/admin/newsletters', '/admin/password', '/admin/logout', '/admin/blog/'];
          if (apiPaths.some(path => req.url?.startsWith(path))) {
            return null; // Proxy to backend
          }
          // For other admin routes (like /admin/dashboard), serve React app for GET
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
