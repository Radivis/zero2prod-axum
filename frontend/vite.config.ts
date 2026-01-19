import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Ensure Content-Type header is forwarded
            if (req.headers['content-type']) {
              proxyReq.setHeader('Content-Type', req.headers['content-type']);
            }
          });
        },
      },
      '/login': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Ensure Content-Type header is forwarded
            if (req.headers['content-type']) {
              proxyReq.setHeader('Content-Type', req.headers['content-type']);
            }
          });
        },
      },
      '/subscriptions': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Ensure Content-Type header is forwarded
            if (req.headers['content-type']) {
              proxyReq.setHeader('Content-Type', req.headers['content-type']);
            }
          });
        },
      },
      '/admin': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Ensure Content-Type header is forwarded
            if (req.headers['content-type']) {
              proxyReq.setHeader('Content-Type', req.headers['content-type']);
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
