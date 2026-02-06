import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
  logger: {
    log: (...args) => {
      // Filter out expected 401 errors from auth checks
      const message = args.join(' ')
      if (message.includes('401') && message.includes('/api/auth/me')) {
        return // Suppress expected 401 errors
      }
      console.log(...args)
    },
    warn: console.warn,
    error: (...args) => {
      // Filter out expected 401 errors from auth checks
      const message = args.join(' ')
      if (message.includes('401') && message.includes('/api/auth/me')) {
        return // Suppress expected 401 errors
      }
      console.error(...args)
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
